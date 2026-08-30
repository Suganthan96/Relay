-- A human approve/reject on the Approvals page feeds back into reputation
-- (md 3: "Approve/Reject … feed back into reputation"). This is a direct,
-- explicit signal — distinct from the test-derived score in recompute_reputation
-- — so it gets its own function: +1 attempt, +1 success only on approve.

create or replace function apply_human_signal(p_agent uuid, p_task_type text, p_success boolean)
returns void language plpgsql
set search_path = ''
as $$
begin
  insert into public.reputation_scores (agent_id, task_type, success_count, total_count, score, updated_at)
  values (p_agent, p_task_type, case when p_success then 1 else 0 end, 1,
          case when p_success then 1 else 0 end, now())
  on conflict (agent_id, task_type) do update
    set success_count = public.reputation_scores.success_count + case when p_success then 1 else 0 end,
        total_count   = public.reputation_scores.total_count + 1,
        score         = (public.reputation_scores.success_count + case when p_success then 1 else 0 end)::float
                        / (public.reputation_scores.total_count + 1),
        updated_at    = now();
end;
$$;

revoke execute on function apply_human_signal(uuid, text, boolean) from public;
