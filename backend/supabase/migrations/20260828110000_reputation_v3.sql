-- Reputation v3 (md 5): refine the tester/reviewer branch.
--
-- The test attempt's `outcome` column must stay pass/fail of the suite because
-- the Coder's reputation is derived from it. But that means "tests failed" and
-- "tester errored" both land as outcome='failed', which would wrongly punish the
-- Tester for a suite that legitimately fails. Same for the Reviewer, whose
-- correct call is often outcome='escalated' (flagged review), not a failure.
--
-- So for tester/reviewer, "success" = the agent produced a verdict at all,
-- i.e. outcome <> 'failed'. Coder/planner are still judged by the task reaching
-- a passing test.

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
      count(*) filter (where ta.outcome <> 'failed')
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
