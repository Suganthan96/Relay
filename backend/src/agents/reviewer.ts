import { runClaude, extractJson } from "./claude.js";
import type { ReviewerInput, ReviewerResult } from "./types.js";

/**
 * Reviewer (md 3): weighs the diff against the declared scope, the test result,
 * and the Coder's live reputation, then decides how the PR should be presented
 * to the human — fast-approve or flagged review. It never merges.
 */

const SHAPE = `{
  "pr_mode": "fast_approve | flagged_review",
  "scope_adhered": true,
  "confidence": 0.0,
  "summary": "2-4 sentences a human reviewer can act on",
  "concerns": ["specific things you are unsure about; [] only for a clean fast_approve"]
}`;

interface ReviewerJson {
  pr_mode: "fast_approve" | "flagged_review";
  scope_adhered: boolean;
  confidence: number;
  summary: string;
  concerns: string[];
}

export async function runReviewer(input: ReviewerInput): Promise<ReviewerResult> {
  const prompt = [
    "You are the REVIEWER in an autonomous bug-fix pipeline. You do NOT merge.",
    "You have NO tools — reason only from the material below and reply immediately",
    "with the JSON object.",
    "Decide how this pull request should reach the human:",
    "  - fast_approve: high confidence, diff is within scope, tests pass, and the",
    "    Coder has a proven track record for this kind of change.",
    "  - flagged_review: anything less — out-of-scope drift, failing/again tests,",
    "    a sensitive area, or a Coder with no track record. List what you're unsure of.",
    "",
    `Issue: ${input.issueTitle}`,
    `Declared scope: ${input.scopeDeclared}`,
    `Tests: ${input.testsPassed ? "PASS" : "FAIL"} — ${input.testSummary}`,
    `Coder reputation for this task_type: ${input.coderReputation.toFixed(2)} ` +
      `(${input.coderHasHistory ? "has history" : "NO history"})`,
    `Sensitive area: ${input.sensitiveArea ? "yes" : "no"}`,
    `Files changed: ${input.filesChanged.join(", ") || "(none)"}`,
    "",
    "Unified diff:",
    input.diff.slice(0, 24_000),
    "",
    "Respond with ONLY a JSON object of this exact shape, no prose, no code fence:",
    SHAPE,
  ].join("\n");

  const res = await runClaude({
    prompt,
    disallowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "WebFetch", "WebSearch"],
    maxTurns: 6,
    retries: 2,
    timeoutMs: 180_000,
  });

  if (res.isError && !res.structuredOutput) {
    return {
      outcome: "escalated",
      scopeAdhered: null,
      confidence: 0,
      detail: { error: "reviewer run errored", raw: res.text.slice(0, 500) },
      prMode: "flagged_review",
      summary: "Reviewer failed to run; routing to manual review.",
      concerns: ["reviewer agent error"],
    };
  }

  const j = (res.structuredOutput as ReviewerJson) ?? extractJson<ReviewerJson>(res.text);
  const prMode = j.pr_mode === "fast_approve" ? "fast_approve" : "flagged_review";
  return {
    outcome: prMode === "fast_approve" ? "passed" : "escalated",
    scopeAdhered: j.scope_adhered,
    confidence: Math.min(1, Math.max(0, j.confidence)),
    detail: { summary: j.summary, concerns: j.concerns, costUsd: res.costUsd },
    prMode,
    summary: j.summary,
    concerns: j.concerns ?? [],
  };
}
