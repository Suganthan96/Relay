import { runClaude } from "./claude.js";
import type { TesterInput, TesterResult } from "./types.js";

/**
 * Tester (md 3): headless Claude Code scoped to running the test suite only —
 * no file-write access. Reports pass/fail.
 */
export async function runTester(input: TesterInput): Promise<TesterResult> {
  const prompt = [
    "You are the TESTER in an autonomous bug-fix pipeline.",
    `Run the project's test suite with: ${input.testCommand}`,
    "Do not edit any files. If dependencies are missing, you may install them",
    "with the project's package manager, then run the tests.",
    "",
    "End your reply with exactly one line:",
    "  RESULT: PASS  — if the suite ran and every test passed",
    "  RESULT: FAIL  — if any test failed or the suite could not run",
    "Precede it with a 2-3 sentence summary (counts, notable failures).",
  ].join("\n");

  const res = await runClaude({
    prompt,
    cwd: input.workdir,
    allowedTools: [
      "Read",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(yarn:*)",
      "Bash(pnpm:*)",
      "Bash(node:*)",
    ],
    disallowedTools: ["Edit", "Write"],
    maxTurns: 20,
    timeoutMs: 600_000,
  });

  const passed = /RESULT:\s*PASS/i.test(res.text) && !res.isError;
  const summary = res.text.replace(/```[\s\S]*?```/g, "").trim().slice(-800);

  return {
    outcome: passed ? "passed" : "failed",
    scopeAdhered: true, // tester never edits
    confidence: null,
    detail: { summary, costUsd: res.costUsd, durationMs: res.durationMs },
    passed,
    summary,
  };
}
