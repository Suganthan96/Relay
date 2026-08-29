import { runClaude } from "./claude.js";
import { diffStat } from "../coordinator/workspace.js";
import type { CoderInput, CoderResult } from "./types.js";

/**
 * Coder (md 3): headless Claude Code with real file access to the working clone,
 * scoped via --allowedTools. It is told the declared scope and the allowed
 * paths; the coordinator afterwards checks whether the diff actually stayed
 * inside them (scope_adhered).
 */
export async function runCoder(input: CoderInput): Promise<CoderResult> {
  const prompt = [
    "You are the CODER in an autonomous bug-fix pipeline.",
    "Implement the plan below by editing files in this repository. Make the",
    "smallest change that fixes the issue. Do not refactor unrelated code, do",
    "not add dependencies, do not touch tests unless the plan says so.",
    "",
    "DECLARED SCOPE (you are held to this):",
    input.scopeDeclared,
    "",
    "Files you may edit:",
    input.allowedPaths.length ? input.allowedPaths.map((p) => `  - ${p}`).join("\n") : "  (infer from the plan)",
    "",
    "PLAN:",
    input.plan,
    "",
    "When done, output one line: DONE <one-sentence summary>. Do not commit.",
  ].join("\n");

  const res = await runClaude({
    prompt,
    cwd: input.workdir,
    allowedTools: ["Read", "Edit", "Write", "Bash(ls:*)", "Bash(cat:*)", "Bash(grep:*)", "Bash(rg:*)", "Bash(find:*)"],
    permissionMode: "acceptEdits",
    maxTurns: 40,
    timeoutMs: 600_000,
  });

  const { files, stat, patch } = await diffStat(input.workdir);

  if (res.isError || files.length === 0) {
    return {
      outcome: "failed",
      scopeAdhered: files.length === 0 ? null : true,
      confidence: 0,
      detail: {
        error: res.isError ? "coder run errored" : "coder produced no diff",
        raw: res.text.slice(0, 500),
        costUsd: res.costUsd,
        diffStat: stat,
      },
      filesChanged: files,
      diffStat: stat,
    };
  }

  return {
    outcome: "passed",
    scopeAdhered: null, // decided by the coordinator against allowedPaths
    confidence: null,
    detail: {
      summary: res.text.trim().split(/\r?\n/).slice(-1)[0],
      costUsd: res.costUsd,
      durationMs: res.durationMs,
      numTurns: res.numTurns,
      patch: patch.slice(0, 20_000),
    },
    filesChanged: files,
    diffStat: stat,
  };
}
