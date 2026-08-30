export type AgentRole = "planner" | "coder" | "tester" | "reviewer";
export type PipelineStep = "plan" | "code" | "test" | "review";
export type Outcome = "passed" | "failed" | "escalated" | "human_override";
export type PrMode = "fast_approve" | "flagged_review";

export interface AgentRow {
  id: string;
  name: string;
  role: AgentRole;
  did: string;
  public_key: string;
}

export interface TaskRow {
  id: string;
  issue_number: number | null;
  issue_title: string | null;
  repo: string | null;
  task_type: string;
  status: string;
  pr_number: number | null;
  pr_url: string | null;
  pr_mode: PrMode | null;
  created_at: string;
}

export interface AttemptRow {
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
  human_approvals?: number;
  human_rejections?: number;
}

export const STEP_INDEX: Record<PipelineStep, number> = { plan: 0, code: 1, test: 2, review: 3 };
export const STEP_LABEL: Record<PipelineStep, string> = {
  plan: "Planner",
  code: "Coder",
  test: "Tester",
  review: "Reviewer",
};
