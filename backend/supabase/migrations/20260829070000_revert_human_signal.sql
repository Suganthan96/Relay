-- Revert 20260829060000_human_signal: the Approvals page and its /api/decision
-- endpoint were removed, so nothing calls apply_human_signal anymore.
drop function if exists apply_human_signal(uuid, text, boolean);
