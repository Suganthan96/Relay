-- Relay data layer (md section 5) — canonical schema.
-- Apply with `npm run db:migrate` (supabase db push) after `supabase link`.
-- Idempotent: every statement is "if not exists" / "create or replace" / guarded.

-- ---------------------------------------------------------------------------
-- extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- agents — one row per agent role, holds the DID + public key (md 4, 5)
-- ---------------------------------------------------------------------------
create table if not exists agents (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,                 -- "Planner" | "Coder" | "Tester" | "Reviewer"
  role       text not null unique
             check (role in ('planner','coder','tester','reviewer')),
  did        text not null unique,           -- did:key:z6Mk...
  public_key text not null,                  -- base58btc multibase, for verification
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tasks — one row per GitHub issue picked up (md 5)
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  issue_number int,
  issue_title  text,
  issue_body   text,
  repo         text,                         -- owner/repo
  task_type    text not null default 'unknown',  -- css-fix | logic-fix | test-add | auth ...
  org_id       uuid,                         -- multi-tenant isolation in production
  status       text not null default 'open'
               check (status in ('open','planning','coding','testing','reviewing',
                                 'pr_opened','merged','rejected','escalated','failed')),
  pr_number    int,
  pr_url       text,
  pr_mode      text check (pr_mode in ('fast_approve','flagged_review')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- task_attempts — the trust graph's node table (md 5)
--   node  = one row  (colour = outcome, size/opacity = reputation)
--   edge  = parent_attempt_id -> id  (the literal handoff chain)
-- ---------------------------------------------------------------------------
create table if not exists task_attempts (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references tasks(id) on delete cascade,
  agent_id          uuid not null references agents(id),
  parent_attempt_id uuid references task_attempts(id) on delete set null,
  step              text not null
                    check (step in ('plan','code','test','review')),
  scope_declared    text,                    -- negotiation step (md 3)
  scope_adhered     boolean,
  outcome           text not null
                    check (outcome in ('passed','failed','escalated','human_override')),
  confidence_score  float,
  payload           jsonb not null,          -- exact canonical object that was signed (md 4)
  signature         text not null,           -- Ed25519 signature (base64) over payload
  verified_by       text,                    -- 'tests' | 'reviewer' | 'human'
  detail            jsonb,                   -- free-form: diff stats, test output, notes
  created_at        timestamptz not null default now()
);

create index if not exists task_attempts_task_idx   on task_attempts(task_id);
create index if not exists task_attempts_parent_idx on task_attempts(parent_attempt_id);

-- ---------------------------------------------------------------------------
-- reputation_scores — derived/cached, scoped per task_type (md 5)
-- ---------------------------------------------------------------------------
create table if not exists reputation_scores (
  agent_id      uuid not null references agents(id) on delete cascade,
  task_type     text not null,
  success_count int not null default 0,
  total_count   int not null default 0,
  score         float not null default 0,   -- success_count / total_count (0 when no history)
  updated_at    timestamptz not null default now(),
  primary key (agent_id, task_type)
);

-- Recompute one agent's reputation for one task_type from verified attempts.
-- "verified" = outcome recorded by tests / reviewer / human, not self-reported.
create or replace function recompute_reputation(p_agent uuid, p_task_type text)
returns void language plpgsql
set search_path = ''
as $$
declare
  v_total int;
  v_success int;
begin
  select count(*),
         count(*) filter (where ta.outcome = 'passed')
    into v_total, v_success
    from public.task_attempts ta
    join public.tasks t on t.id = ta.task_id
   where ta.agent_id = p_agent
     and t.task_type = p_task_type
     and ta.verified_by is not null;

  insert into public.reputation_scores (agent_id, task_type, success_count, total_count, score, updated_at)
  values (p_agent, p_task_type, coalesce(v_success,0), coalesce(v_total,0),
          case when coalesce(v_total,0) = 0 then 0 else v_success::float / v_total end, now())
  on conflict (agent_id, task_type) do update
    set success_count = excluded.success_count,
        total_count   = excluded.total_count,
        score         = excluded.score,
        updated_at    = now();
end;
$$;

-- recompute_reputation is only ever called by the pipeline (service-role key).
-- Postgres grants EXECUTE to PUBLIC by default, so revoke it (Supabase skill).
revoke execute on function recompute_reputation(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- realtime — dashboard subscribes to task_attempts + tasks (md 5)
-- Guarded: re-running is a no-op instead of "already member of publication".
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['task_attempts','tasks','reputation_scores'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS — demo: allow anon read, writes go through the service-role key only.
-- Production: scope every policy by org_id (md 6).
-- ---------------------------------------------------------------------------
alter table agents            enable row level security;
alter table tasks             enable row level security;
alter table task_attempts     enable row level security;
alter table reputation_scores enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'agents' and policyname = 'anon_read') then
    create policy anon_read on agents            for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tasks' and policyname = 'anon_read') then
    create policy anon_read on tasks             for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'task_attempts' and policyname = 'anon_read') then
    create policy anon_read on task_attempts     for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reputation_scores' and policyname = 'anon_read') then
    create policy anon_read on reputation_scores for select to anon, authenticated using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Data API exposure. Since 2026-04-28 new public tables are NOT auto-exposed
-- to the REST/Realtime API, so grant the read roles explicitly (RLS above
-- still governs which rows come back). Writes never use these roles.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on agents, tasks, task_attempts, reputation_scores to anon, authenticated;
