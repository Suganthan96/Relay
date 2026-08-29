import type { AgentRole } from "../identity/keys.js";

export type PipelineStep = "plan" | "code" | "test" | "review";
export type Outcome = "passed" | "failed" | "escalated" | "human_override";
export type PrMode = "fast_approve" | "flagged_review";

export type TaskStatus =
  | "open"
  | "planning"
  | "coding"
  | "testing"
  | "reviewing"
  | "pr_opened"
  | "merged"
  | "rejected"
  | "escalated"
  | "failed";

export interface AgentRow {
  id: string;
  name: string;
  role: AgentRole;
  did: string;
  public_key: string;
  created_at: string;
}

export interface TaskRow {
  id: string;
  issue_number: number | null;
  issue_title: string | null;
  issue_body: string | null;
  repo: string | null;
  task_type: string;
  org_id: string | null;
  status: TaskStatus;
  pr_number: number | null;
  pr_url: string | null;
  pr_mode: PrMode | null;
  created_at: string;
  updated_at: string;
}

export interface TaskAttemptRow {
  id: string;
  task_id: string;
  agent_id: string;
  parent_attempt_id: string | null;
  step: PipelineStep;
  scope_declared: string | null;
  scope_adhered: boolean | null;
  outcome: Outcome;
  confidence_score: number | null;
  payload: Record<string, unknown>;
  signature: string;
  verified_by: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface ReputationRow {
  agent_id: string;
  task_type: string;
  success_count: number;
  total_count: number;
  score: number;
  updated_at: string;
}
