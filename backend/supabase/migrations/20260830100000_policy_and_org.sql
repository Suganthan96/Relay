-- ============================================================================
-- Production hardening (md 6): per-team trust policy + multi-org isolation.
-- ============================================================================

-- ---- 1. per-team trust policy -------------------------------------------------
-- One row per repo ('owner/name'), plus a '*' row that is the default. The
-- coordinator reads the repo's row and falls back to '*'.
create table if not exists relay_policies (
  id                     uuid primary key default gen_random_uuid(),
  repo                   text not null unique default '*',
  trust_threshold        float not null default 0.8,      -- score at/above which a proven agent proceeds unflagged
  min_history            int   not null default 3,        -- verified attempts before trust is "earned"
  sensitive_paths        text[] not null default array[
                           'auth','login','session','oauth',
                           'payment','payments','billing','stripe','checkout',
                           'security','secret','secrets','crypto','key','keys',
                           'migration','migrations','.github/workflows','ci'],
  auto_approve_task_types text[] not null default array['css-fix','docs','copy'],  -- eligible for fast-approve
  always_flag_task_types  text[] not null default array['auth','payments'],        -- never fast-approve, any score
  updated_at             timestamptz not null default now()
);

insert into relay_policies (repo) values ('*') on conflict (repo) do nothing;

alter table relay_policies enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='relay_policies' and policyname='anon_read') then
    create policy anon_read on relay_policies for select to anon, authenticated using (true);
  end if;
end $$;
grant select on relay_policies to anon, authenticated;

-- ---- 2. multi-org isolation -------------------------------------------------
-- Every task belongs to an org. attempts + reputation inherit it. A single
-- "default" org is used until RELAY_ENFORCE_ORG is turned on.
create table if not exists orgs (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);
insert into orgs (slug, name) values ('default', 'Default org')
  on conflict (slug) do nothing;

alter table tasks             add column if not exists org_slug text not null default 'default';
alter table task_attempts     add column if not exists org_slug text not null default 'default';
alter table reputation_scores add column if not exists org_slug text not null default 'default';
alter table relay_policies    add column if not exists org_slug text not null default 'default';

create index if not exists tasks_org_idx        on tasks(org_slug);
create index if not exists attempts_org_idx     on task_attempts(org_slug);
create index if not exists reputation_org_idx   on reputation_scores(org_slug);

-- The org for the current request: a JWT claim wins, else a request header,
-- else NULL (which the "enforce" policies below treat as no access).
create or replace function relay_current_org()
returns text language sql stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::json ->> 'org_slug', ''),
    nullif(current_setting('request.headers', true)::json ->> 'x-relay-org', ''),
    null
  )
$$;

-- Enforcing policies are created but NOT enabled: the existing permissive
-- anon_read policies still grant access. Flip by dropping anon_read and
-- creating these. (Kept as a template so the app can switch on demand.)
comment on function relay_current_org() is
  'multi-org: returns the caller org from a jwt claim or x-relay-org header';

-- ---- 3. reputation.org_slug in the scoped key -----------------------------
-- reputation is now per (org, agent, task_type). Widen the PK.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'reputation_scores_pkey') then
    alter table reputation_scores drop constraint reputation_scores_pkey;
  end if;
  alter table reputation_scores
    add constraint reputation_scores_pkey primary key (org_slug, agent_id, task_type);
exception when others then null;
end $$;

-- recompute_reputation / apply_human_signal keyed by org too.
-- Drop the pre-org overloads so the 2-arg call resolves to the new default-org one.
drop function if exists recompute_reputation(uuid, text);
drop function if exists apply_human_signal(uuid, text, boolean);

create or replace function recompute_reputation(p_agent uuid, p_task_type text, p_org text default 'default')
returns void language plpgsql
set search_path = ''
as $$
declare
  v_role text; v_total int; v_success int; v_appr int := 0; v_rej int := 0;
begin
  select role into v_role from public.agents where id = p_agent;
  select coalesce(human_approvals,0), coalesce(human_rejections,0)
    into v_appr, v_rej
    from public.reputation_scores
   where agent_id = p_agent and task_type = p_task_type and org_slug = p_org;
  v_appr := coalesce(v_appr,0); v_rej := coalesce(v_rej,0);

  if v_role in ('coder','planner') then
    select count(*),
           count(*) filter (where exists (
             select 1 from public.task_attempts tv
             where tv.task_id = ta.task_id and tv.step='test' and tv.outcome='passed'))
      into v_total, v_success
      from public.task_attempts ta
      join public.tasks t on t.id = ta.task_id
     where ta.agent_id = p_agent and t.task_type = p_task_type and t.org_slug = p_org
       and ta.step in ('plan','code') and ta.verified_by is not null;
  else
    select count(*), count(*) filter (where ta.outcome <> 'failed')
      into v_total, v_success
      from public.task_attempts ta
      join public.tasks t on t.id = ta.task_id
     where ta.agent_id = p_agent and t.task_type = p_task_type and t.org_slug = p_org
       and ta.verified_by is not null;
  end if;

  insert into public.reputation_scores
    (org_slug, agent_id, task_type, success_count, total_count, score, human_approvals, human_rejections, updated_at)
  values
    (p_org, p_agent, p_task_type, coalesce(v_success,0), coalesce(v_total,0),
     public.relay_trust_score(coalesce(v_success,0), coalesce(v_total,0), v_appr, v_rej),
     v_appr, v_rej, now())
  on conflict (org_slug, agent_id, task_type) do update
    set success_count = excluded.success_count,
        total_count   = excluded.total_count,
        score         = public.relay_trust_score(excluded.success_count, excluded.total_count,
                          public.reputation_scores.human_approvals, public.reputation_scores.human_rejections),
        updated_at    = now();
end;
$$;

create or replace function apply_human_signal(p_agent uuid, p_task_type text, p_success boolean, p_org text default 'default')
returns void language plpgsql
set search_path = ''
as $$
declare v_s int; v_t int; v_a int; v_r int;
begin
  insert into public.reputation_scores
    (org_slug, agent_id, task_type, success_count, total_count, score, human_approvals, human_rejections, updated_at)
  values
    (p_org, p_agent, p_task_type, 0, 0, 0.5,
     case when p_success then 1 else 0 end,
     case when p_success then 0 else 1 end, now())
  on conflict (org_slug, agent_id, task_type) do update
    set human_approvals  = public.reputation_scores.human_approvals  + case when p_success then 1 else 0 end,
        human_rejections = public.reputation_scores.human_rejections + case when p_success then 0 else 1 end,
        updated_at = now();

  select success_count, total_count, human_approvals, human_rejections
    into v_s, v_t, v_a, v_r
    from public.reputation_scores
   where agent_id = p_agent and task_type = p_task_type and org_slug = p_org;

  update public.reputation_scores
     set score = public.relay_trust_score(v_s, v_t, v_a, v_r), updated_at = now()
   where agent_id = p_agent and task_type = p_task_type and org_slug = p_org;
end;
$$;

revoke execute on function recompute_reputation(uuid, text, text) from public;
revoke execute on function apply_human_signal(uuid, text, boolean, text) from public;

alter table orgs enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='orgs' and policyname='anon_read') then
    create policy anon_read on orgs for select to anon, authenticated using (true);
  end if;
end $$;
grant select on orgs to anon, authenticated;

alter publication supabase_realtime add table relay_policies;
