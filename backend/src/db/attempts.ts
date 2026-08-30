import { db } from "./client.js";
import type { PipelineStep, Outcome, TaskAttemptRow, TaskRow } from "./types.js";
import type { AgentKey } from "../identity/keys.js";
import {
  signPayload,
  verifyPayload,
  type AttestationPayload,
} from "../identity/signing.js";

const STEP_TO_OUTCOME_VERIFIER: Record<PipelineStep, string | null> = {
  plan: null, // a plan is not yet verified by anything
  code: null, // the diff is verified downstream by the tester
  test: "tests",
  review: "reviewer",
};

export interface RecordAttemptInput {
  task: Pick<TaskRow, "id" | "task_type">;
  step: PipelineStep;
  agentKey: AgentKey;
  agentId: string;
  parentAttemptId: string | null;
  scopeDeclared: string;
  scopeAdhered: boolean | null;
  outcome: Outcome;
  confidence?: number | null;
  /** overrides the default verifier for the step (e.g. "human" on override) */
  verifiedBy?: string | null;
  /** free-form: diff stats, test output, reviewer notes */
  detail?: Record<string, unknown>;
}

/**
 * The one write every pipeline step funnels through (md 3): build the canonical
 * attestation, sign it with the agent's Ed25519 key, insert the task_attempts
 * row, and — once an outcome is verified — refresh that agent's reputation for
 * this task_type.
 */
export async function recordAttempt(input: RecordAttemptInput): Promise<TaskAttemptRow> {
  const payload: AttestationPayload = {
    agent_did: input.agentKey.did,
    task_id: input.task.id,
    task_type: input.task.task_type,
    scope_declared: input.scopeDeclared,
    outcome: input.outcome,
    timestamp: new Date().toISOString(),
  };

  const signature = signPayload(payload, input.agentKey.privateKey);
  const verifiedBy =
    input.verifiedBy !== undefined
      ? input.verifiedBy
      : STEP_TO_OUTCOME_VERIFIER[input.step];

  const { data, error } = await db()
    .from("task_attempts")
    .insert({
      task_id: input.task.id,
      agent_id: input.agentId,
      parent_attempt_id: input.parentAttemptId,
      step: input.step,
      scope_declared: input.scopeDeclared,
      scope_adhered: input.scopeAdhered,
      outcome: input.outcome,
      confidence_score: input.confidence ?? null,
      payload,
      signature,
      verified_by: verifiedBy,
      detail: input.detail ?? null,
      org_slug: (input.task as { org_slug?: string }).org_slug ?? "default",
    })
    .select()
    .single();

  if (error) throw new Error(`recordAttempt insert failed: ${error.message}`);

  if (verifiedBy) {
    const { error: rpcErr } = await db().rpc("recompute_reputation", {
      p_agent: input.agentId,
      p_task_type: input.task.task_type,
    });
    if (rpcErr) throw new Error(`recompute_reputation failed: ${rpcErr.message}`);
  }

  return data as TaskAttemptRow;
}

export interface AttemptVerification {
  ok: boolean;
  signatureValid: boolean;
  /** the row's displayed columns still match the signed payload */
  consistent: boolean;
  mismatch: string[];
}

/**
 * Re-verify a stored attempt straight from its row (md 4). Two independent
 * checks, both must hold:
 *   - signatureValid: Ed25519 signature checks out against the DID in the payload
 *   - consistent:     the columns the dashboard renders (outcome, scope_declared,
 *                     task_type via the payload) still equal what was signed
 *
 * The demo "tamper" button edits `outcome` directly in the DB. The payload +
 * signature are untouched, so signatureValid stays true — but `consistent`
 * flips to false, and the badge goes ✓ -> ✗.
 */
export function verifyAttemptRow(
  row: Pick<TaskAttemptRow, "payload" | "signature" | "outcome" | "scope_declared">,
): AttemptVerification {
  const payload = row.payload as unknown as AttestationPayload;
  const signatureValid = verifyPayload(payload, row.signature);

  const mismatch: string[] = [];
  if (payload.outcome !== row.outcome) {
    mismatch.push(`outcome: signed "${payload.outcome}" vs row "${row.outcome}"`);
  }
  if (row.scope_declared != null && payload.scope_declared !== row.scope_declared) {
    mismatch.push(`scope_declared: signed "${payload.scope_declared}" vs row "${row.scope_declared}"`);
  }
  const consistent = mismatch.length === 0;

  return { ok: signatureValid && consistent, signatureValid, consistent, mismatch };
}
