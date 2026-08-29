import { db } from "../db/client.js";
import type { ReputationRow } from "../db/types.js";

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

export async function getReputation(agentId: string, taskType: string): Promise<Reputation> {
  const { data, error } = await db()
    .from("reputation_scores")
    .select("*")
    .eq("agent_id", agentId)
    .eq("task_type", taskType)
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
  /** minimum verified attempts before trust can be considered "earned" */
  minHistory?: number;
  /** score at/above which a proven agent is trusted to proceed unflagged */
  trustThreshold?: number;
}

export interface GateDecision {
  proceed: boolean; // false => escalate before the Coder runs
  reason: string;
}

/**
 * The proceed/escalate gate that sits between Planner and Coder (md 3).
 * Relay never blocks the work outright — "escalate" means the eventual PR is
 * opened as a flagged review rather than a fast-approve.
 */
export function evaluateGate(input: GateInput): GateDecision {
  const { reputation: rep, sensitiveArea } = input;
  const minHistory = input.minHistory ?? 3;
  const trustThreshold = input.trustThreshold ?? 0.8;

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
    return { proceed: false, reason: `reputation ${rep.score.toFixed(2)} below trust threshold ${trustThreshold}` };
  }
  return { proceed: true, reason: `reputation ${rep.score.toFixed(2)} over ${rep.totalCount} verified attempts` };
}
