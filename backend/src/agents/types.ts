import type { Outcome, PipelineStep } from "../db/types.js";

/**
 * Every agent takes a typed input and returns a typed result. The coordinator
 * turns that result into a signed task_attempt via recordAttempt() (md 3).
 */
export interface AgentResult {
  outcome: Outcome;
  /** did the work stay inside the scope the Planner declared? */
  scopeAdhered: boolean | null;
  /** 0..1 — the agent's own confidence in this step */
  confidence: number | null;
  /** free-form, stored on task_attempts.detail (diff stats, test output, notes) */
  detail: Record<string, unknown>;
}

export interface PlannerInput {
  issueTitle: string;
  issueBody: string;
  repo: string;
}

export interface PlannerResult extends AgentResult {
  /** clustering key for reputation (md 5): css-fix | logic-fix | test-add | auth ... */
  taskType: string;
  /** "I will change X. I will NOT touch Y." (md 3) */
  scopeDeclared: string;
  plan: string;
  /** globs the Coder is allowed to edit, derived from the scope */
  allowedPaths: string[];
}

export interface CoderInput {
  plan: string;
  scopeDeclared: string;
  allowedPaths: string[];
  /** absolute path to the working clone */
  workdir: string;
}

export interface CoderResult extends AgentResult {
  filesChanged: string[];
  diffStat: string;
}

export interface TesterInput {
  workdir: string;
  /** command the project uses, discovered from package.json */
  testCommand: string;
  /** one-line summary of the pipeline's own test/build/boot check result */
  checksSummary?: string;
}

export interface TesterResult extends AgentResult {
  passed: boolean;
  summary: string;
}

export interface ReviewerInput {
  issueTitle: string;
  scopeDeclared: string;
  diff: string;
  filesChanged: string[];
  testsPassed: boolean;
  testSummary: string;
  /** Coder's live reputation for this task_type, 0..1 */
  coderReputation: number;
  coderHasHistory: boolean;
  sensitiveArea: boolean;
}

export interface ReviewerResult extends AgentResult {
  /** how the PR should be opened (md 3) */
  prMode: "fast_approve" | "flagged_review";
  summary: string;
  concerns: string[];
}

export const STEP_LABEL: Record<PipelineStep, string> = {
  plan: "Planner",
  code: "Coder",
  test: "Tester",
  review: "Reviewer",
};
