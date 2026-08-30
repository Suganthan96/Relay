-- Turn ON hard multi-org isolation (md 6·6). Run when Relay is hosting more
-- than one team. Reverts with relax-org.sql.
--
--   backend $ npm run db:apply -- supabase/enforce-org.sql   (via Management API)
--
-- After this, a dashboard read only sees rows whose org_slug matches the
-- caller's org (from the `x-relay-org` header or a jwt `org_slug` claim).
-- The service-role key (backend) still bypasses RLS and writes any org.

drop policy if exists anon_read on tasks;
drop policy if exists anon_read on task_attempts;
drop policy if exists anon_read on reputation_scores;
drop policy if exists anon_read on relay_policies;

create policy org_read on tasks
  for select to anon, authenticated using (org_slug = public.relay_current_org());
create policy org_read on task_attempts
  for select to anon, authenticated using (org_slug = public.relay_current_org());
create policy org_read on reputation_scores
  for select to anon, authenticated using (org_slug = public.relay_current_org());
create policy org_read on relay_policies
  for select to anon, authenticated using (org_slug = public.relay_current_org());

-- the tamper demo stays scoped to the caller's org too
drop policy if exists anon_tamper_outcome on task_attempts;
create policy anon_tamper_outcome on task_attempts
  for update to anon using (org_slug = public.relay_current_org())
  with check (org_slug = public.relay_current_org());
