-- Reputation v2 (md 5): judge agents by VERIFIED outcomes without ever mutating
-- a signed attestation.
--
-- The Coder self-reports outcome "passed" meaning "I produced the change" — that
-- value is part of the signed payload and must not be rewritten. What actually
-- counts as success is decided downstream:
--   coder / planner : the task ended with a passing `test` attempt
--   tester / reviewer: their own recorded outcome (which is itself the verification)
--
-- An attempt is only scored once verified_by is set (the coordinator sets
-- verified_by = 'tests' on the plan + code attempts after the tester runs).

create or replace function recompute_reputation(p_agent uuid, p_task_type text)
returns void language plpgsql
set search_path = ''
as $$
declare
  v_role text;
  v_total int;
  v_success int;
begin
  select role into v_role from public.agents where id = p_agent;

  if v_role in ('coder', 'planner') then
    select
      count(*),
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
    select
      count(*),
      count(*) filter (where ta.outcome = 'passed')
      into v_total, v_success
      from public.task_attempts ta
      join public.tasks t on t.id = ta.task_id
     where ta.agent_id = p_agent
       and t.task_type = p_task_type
       and ta.verified_by is not null;
  end if;

  insert into public.reputation_scores (agent_id, task_type, success_count, total_count, score, updated_at)
  values (p_agent, p_task_type, coalesce(v_success, 0), coalesce(v_total, 0),
          case when coalesce(v_total, 0) = 0 then 0 else v_success::float / v_total end, now())
  on conflict (agent_id, task_type) do update
    set success_count = excluded.success_count,
        total_count   = excluded.total_count,
        score         = excluded.score,
        updated_at    = now();
end;
$$;

revoke execute on function recompute_reputation(uuid, text) from public;
