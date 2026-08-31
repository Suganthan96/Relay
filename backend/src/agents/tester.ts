import { runClaude } from "./claude.js";
import type { TesterInput, TesterResult } from "./types.js";
import type { TestRun } from "../coordinator/workspace.js";

/**
 * Tester (md 3): headless Claude Code scoped to running the test suite only —
 * no file-write access. It installs deps if needed and narrates what it saw.
 * The pipeline is the arbiter of pass/fail: it compares this run against a
 * BASELINE taken before the Coder's change, so a pre-existing unrelated failure
 * is not blamed on this task — only a regression is.
 */
export async function runTester(input: TesterInput & { baseline?: TestRun }): Promise<TesterResult> {
  const baselineNote = input.baseline
    ? input.baseline.passed
      ? "Before this change the suite was GREEN, so any failure now is a regression."
      : `Before this change the suite ALREADY had ${input.baseline.failures.length} failure(s):\n` +
        input.baseline.failures.map((f) => `  - ${f}`).join("\n") +
        "\nThose are pre-existing and NOT this change's fault — only NEW failures matter."
    : "";

  const prompt = [
    "You are the TESTER in an autonomous bug-fix pipeline.",
    `Run the project's test suite with: ${input.testCommand}`,
    "Do not edit any files. If dependencies are missing, install them with the",
    "project's package manager, then run the tests.",
    "The pipeline ALSO independently builds the project and — if it's a web app —",
    "boots the server and hits it over HTTP, and compares all of that to a",
    "baseline taken before the change. Its result:",
    input.checksSummary ? `  ${input.checksSummary}` : "  (not available)",
    baselineNote,
    "",
    "Summarise in 2-3 sentences: how many tests passed/failed, whether the build",
    "still succeeds and the app still boots, whether any failure is NEW versus",
    "pre-existing, and whether the issue's fix is exercised by a test. End with",
    "exactly one line: RESULT: PASS or RESULT: FAIL",
    "(PASS = no NEW failures were introduced in tests, build, or boot).",
  ].filter(Boolean).join("\n");

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
