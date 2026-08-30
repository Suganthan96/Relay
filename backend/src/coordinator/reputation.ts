import { db } from "../db/client.js";
import type { ReputationRow } from "../db/types.js";
import type { Policy } from "./policy.js";

/**
 * Reputation is scoped per (agent, task_type) — never one blanket number (md 5).
 * A row with total_count = 0 means "no track record for this kind of work".
 */
export interface Reputation {
  score: number; // 0..1
  successCount: number;
  totalCount: number;
  hasHistory: boolean;
}

export const NO_HISTORY: Reputation = { score: 0, successCount: 0, totalCount: 0, hasHistory: false };

export async function getReputation(
  agentId: string,
  taskType: string,
  orgSlug = "default",
): Promise<Reputation> {
  const { data, error } = await db()
    .from("reputation_scores")
    .select("*")
    .eq("agent_id", agentId)
    .eq("task_type", taskType)
    .eq("org_slug", orgSlug)
    .maybeSingle();
  if (error) throw new Error(`getReputation failed: ${error.message}`);
  if (!data) return NO_HISTORY;
  const r = data as ReputationRow;
  return {
    score: r.score,
    successCount: r.success_count,
    totalCount: r.total_count,
    hasHistory: r.total_count > 0,
  };
}

export interface GateInput {
  reputation: Reputation;
  sensitiveArea: boolean;
  taskType: string;
  policy: Policy;
}

export interface GateDecision {
  proceed: boolean; // false => escalate before the Coder runs
  reason: string;
}

/**
 * The proceed/escalate gate that sits between Planner and Coder (md 3), now
 * driven by the team's trust policy (md 6·3). Relay never blocks the work —
 * "escalate" just means the PR opens as a flagged review, not a fast-approve.
 */
export function evaluateGate(input: GateInput): GateDecision {
  const { reputation: rep, sensitiveArea, taskType, policy } = input;
  const { minHistory, trustThreshold } = policy;

  if (policy.alwaysFlagTaskTypes.includes(taskType)) {
    return { proceed: false, reason: `policy: "${taskType}" always goes to flagged review` };
  }
  if (sensitiveArea && !(rep.hasHistory && rep.totalCount >= minHistory && rep.score >= trustThreshold)) {
    return { proceed: false, reason: "sensitive area with no proven track record" };
  }
  if (!rep.hasHistory) {
    return { proceed: false, reason: "no reputation history for this task_type" };
  }
  if (rep.totalCount < minHistory) {
    return { proceed: false, reason: `only ${rep.totalCount} prior verified attempt(s) (< ${minHistory})` };
  }
  if (rep.score < trustThreshold) {
    return { proceed: false, reason: `trust ${rep.score.toFixed(2)} below policy threshold ${trustThreshold}` };
  }
  if (policy.autoApproveTaskTypes.length && !policy.autoApproveTaskTypes.includes(taskType)) {
    return { proceed: false, reason: `policy: "${taskType}" is not in the fast-approve list` };
  }
  return { proceed: true, reason: `trust ${rep.score.toFixed(2)} over ${rep.totalCount} verified attempts (policy allows)` };
}
