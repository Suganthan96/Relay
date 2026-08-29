import { runClaude, extractJson } from "./claude.js";
import type { PlannerInput, PlannerResult } from "./types.js";

/**
 * Planner (md 3): reads the issue, proposes a plan, and — critically — declares
 * a scope ("I will change X, I will not touch Y"). Tool-less reasoning run.
 */

const SHAPE = `{
  "task_type": "one of: css-fix | logic-fix | test-add | docs | config | auth | payments | refactor | other",
  "scope_declared": "1-2 sentences: exactly what will change AND what will explicitly NOT be touched",
  "plan": "3-6 concrete numbered steps",
  "allowed_paths": ["file globs the Coder may edit, e.g. styles/**, src/components/Login*"],
  "confidence": 0.0,
  "sensitive_area": false
}`;

interface PlannerJson {
  task_type: string;
  scope_declared: string;
  plan: string;
  allowed_paths: string[];
  confidence: number;
  sensitive_area: boolean;
}

export async function runPlanner(input: PlannerInput): Promise<PlannerResult> {
  const prompt = [
    "You are the PLANNER in an autonomous bug-fix pipeline. You do NOT write code.",
    "You have NO tools — do not attempt to read files or run commands. Reason only",
    "from the issue text below and reply immediately with the JSON object.",
    "The declared scope is a commitment the Coder will be held to — be specific about",
    "what will change and what must NOT be touched.",
    "",
    `Repo: ${input.repo}`,
    `Issue title: ${input.issueTitle}`,
    "Issue body:",
    input.issueBody || "(no body)",
    "",
    "Respond with ONLY a JSON object of this exact shape, no prose, no code fence:",
    SHAPE,
  ].join("\n");

  const res = await runClaude({
    prompt,
    disallowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "WebFetch", "WebSearch"],
    maxTurns: 6,
    retries: 2,
    timeoutMs: 120_000,
  });

  if (res.isError && !res.structuredOutput) {
    return {
      outcome: "failed",
      scopeAdhered: null,
      confidence: 0,
      detail: {
        error: `planner run ${res.subtype}`,
        raw: (res.text ?? "").slice(0, 500),
        costUsd: res.costUsd,
      },
      taskType: "unknown",
      scopeDeclared: "",
      plan: "",
      allowedPaths: [],
    };
  }

  const j = (res.structuredOutput as PlannerJson) ?? extractJson<PlannerJson>(res.text);
  return {
    outcome: "passed",
    scopeAdhered: null, // the Planner declares scope; adherence is judged later
    confidence: clamp01(j.confidence),
    detail: {
      plan: j.plan,
      sensitiveArea: j.sensitive_area,
      costUsd: res.costUsd,
      durationMs: res.durationMs,
    },
    taskType: j.task_type || "unknown",
    scopeDeclared: j.scope_declared,
    plan: j.plan,
    allowedPaths: j.allowed_paths ?? [],
  };
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
