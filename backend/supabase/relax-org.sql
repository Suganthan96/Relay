-- Turn OFF hard multi-org isolation — back to single-tenant "anon can read
-- everything" (the default). Undoes enforce-org.sql.

drop policy if exists org_read on tasks;
drop policy if exists org_read on task_attempts;
drop policy if exists org_read on reputation_scores;
drop policy if exists org_read on relay_policies;

create policy anon_read on tasks             for select to anon, authenticated using (true);
create policy anon_read on task_attempts     for select to anon, authenticated using (true);
create policy anon_read on reputation_scores for select to anon, authenticated using (true);
create policy anon_read on relay_policies    for select to anon, authenticated using (true);

drop policy if exists anon_tamper_outcome on task_attempts;
create policy anon_tamper_outcome on task_attempts
  for update to anon using (true) with check (true);
