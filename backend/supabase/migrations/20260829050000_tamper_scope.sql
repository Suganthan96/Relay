-- Tighten the demo tamper affordance: Supabase's default table grants leave anon
-- with table-wide UPDATE, so the column-scoped grant in demo_tamper was a no-op.
-- Revoke every write from anon on the Relay tables, then re-grant ONLY
-- task_attempts.outcome. The dashboard stays read-only everywhere else; the
-- tamper button can touch exactly one column.
--
-- (Even without this, forging a passing record is impossible — the Ed25519
--  signature can't be reproduced — but least privilege is the right default.)

revoke insert, update, delete, truncate on agents            from anon;
revoke insert, update, delete, truncate on tasks             from anon;
revoke insert, update, delete, truncate on task_attempts     from anon;
revoke insert, update, delete, truncate on reputation_scores from anon;

grant update (outcome) on task_attempts to anon;
