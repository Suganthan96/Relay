-- Demo "tamper" button (md 4): let the dashboard's anon client edit ONLY
-- task_attempts.outcome, so the signed payload and the row disagree and the
-- verification badge flips ✓ -> ✗ live over Realtime.
--
-- Column-scoped GRANT keeps the blast radius to that one column; the RLS policy
-- makes the UPDATE reachable. This is a demo affordance — remove for production.

grant update (outcome) on task_attempts to anon;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'task_attempts' and policyname = 'anon_tamper_outcome'
  ) then
    create policy anon_tamper_outcome on task_attempts
      for update to anon using (true) with check (true);
  end if;
end $$;
