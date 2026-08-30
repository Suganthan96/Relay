-- Agent TRUST SCORE (md 3/5): one formula that blends test-verified outcomes
-- with human merge decisions, the latter weighted more heavily.
--
--   trust = ( tests_ok·1 + approvals·3 + α·p0 )
--         / ( tests_total·1 + (approvals + rejections)·3 + α )
--
--   α = 2 (Laplace smoothing), p0 = 0.5 (neutral prior)
--   a brand-new agent sits at 0.50; a human approve is worth 3 test-passes;
--   a human reject pulls hard toward 0.

alter table reputation_scores add column if not exists human_approvals  int not null default 0;
alter table reputation_scores add column if not exists human_rejections int not null default 0;

create or replace function relay_trust_score(p_success int, p_total int, p_approvals int, p_rejections int)
returns float language sql immutable
set search_path = ''
as $$
  select (coalesce(p_success,0)::float + 3 * coalesce(p_approvals,0) + 1.0)
       / nullif(coalesce(p_total,0)::float + 3 * (coalesce(p_approvals,0) + coalesce(p_rejections,0)) + 2.0, 0)
$$;

-- recompute from test-verified attempts, then score with relay_trust_score
create or replace function recompute_reputation(p_agent uuid, p_task_type text)
returns void language plpgsql
set search_path = ''
as $$
declare
  v_role text;
  v_total int;
  v_success int;
  v_appr int := 0;
  v_rej  int := 0;
begin
  select role into v_role from public.agents where id = p_agent;
  select coalesce(human_approvals, 0), coalesce(human_rejections, 0)
    into v_appr, v_rej
    from public.reputation_scores
   where agent_id = p_agent and task_type = p_task_type;
  v_appr := coalesce(v_appr, 0);
  v_rej  := coalesce(v_rej, 0);

  if v_role in ('coder', 'planner') then
    select count(*),
           count(*) filter (where exists (
             select 1 from public.task_attempts tv
             where tv.task_id = ta.task_id and tv.step = 'test' and tv.outcome = 'passed'))
      into v_total, v_success
      from public.task_attempts ta
      join public.tasks t on t.id = ta.task_id
     where ta.agent_id = p_agent
       and t.task_type = p_task_type
       and ta.step in ('plan', 'code')
       and ta.verified_by is not null;
  else
    select count(*), count(*) filter (where ta.outcome <> 'failed')
      into v_total, v_success
      from public.task_attempts ta
      join public.tasks t on t.id = ta.task_id
     where ta.agent_id = p_agent
       and t.task_type = p_task_type
       and ta.verified_by is not null;
  end if;

  insert into public.reputation_scores
    (agent_id, task_type, success_count, total_count, score, human_approvals, human_rejections, updated_at)
  values
    (p_agent, p_task_type, coalesce(v_success, 0), coalesce(v_total, 0),
     public.relay_trust_score(coalesce(v_success, 0), coalesce(v_total, 0), v_appr, v_rej),
     v_appr, v_rej, now())
  on conflict (agent_id, task_type) do update
    set success_count = excluded.success_count,
        total_count   = excluded.total_count,
        score         = public.relay_trust_score(excluded.success_count, excluded.total_count,
                                                 public.reputation_scores.human_approvals,
                                                 public.reputation_scores.human_rejections),
        updated_at    = now();
end;
$$;

-- a human approve/reject: bump the tally, then rescore with the same formula
create or replace function apply_human_signal(p_agent uuid, p_task_type text, p_success boolean)
returns void language plpgsql
set search_path = ''
as $$
declare v_s int; v_t int; v_a int; v_r int;
begin
  insert into public.reputation_scores
    (agent_id, task_type, success_count, total_count, score, human_approvals, human_rejections, updated_at)
  values
    (p_agent, p_task_type, 0, 0, 0.5,
     case when p_success then 1 else 0 end,
     case when p_success then 0 else 1 end, now())
  on conflict (agent_id, task_type) do update
    set human_approvals  = public.reputation_scores.human_approvals  + case when p_success then 1 else 0 end,
        human_rejections = public.reputation_scores.human_rejections + case when p_success then 0 else 1 end,
        updated_at = now();

  select success_count, total_count, human_approvals, human_rejections
    into v_s, v_t, v_a, v_r
    from public.reputation_scores
   where agent_id = p_agent and task_type = p_task_type;

  update public.reputation_scores
     set score = public.relay_trust_score(v_s, v_t, v_a, v_r), updated_at = now()
   where agent_id = p_agent and task_type = p_task_type;
end;
$$;

revoke execute on function relay_trust_score(int, int, int, int) from public;
revoke execute on function apply_human_signal(uuid, text, boolean) from public;
revoke execute on function recompute_reputation(uuid, text) from public;

-- rescore every existing row with the new formula
do $$
declare r record;
begin
  for r in select agent_id, task_type, success_count, total_count, human_approvals, human_rejections
           from public.reputation_scores loop
    update public.reputation_scores
       set score = public.relay_trust_score(r.success_count, r.total_count, r.human_approvals, r.human_rejections)
     where agent_id = r.agent_id and task_type = r.task_type;
  end loop;
end $$;
