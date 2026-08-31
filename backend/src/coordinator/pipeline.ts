import { minimatch } from "minimatch";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { loadAgents } from "../db/agents.js";
import { getTask, patchTask } from "../db/tasks.js";
import { recordAttempt } from "../db/attempts.js";
import { loadAgentKeys } from "../identity/keys.js";
import type { TaskAttemptRow } from "../db/types.js";
import { getReputation, evaluateGate } from "./reputation.js";
import { loadPolicy, touchesSensitivePath } from "./policy.js";
import { notifyEscalation } from "./notify.js";
import { sandboxAvailable } from "./sandbox.js";
import {
  prepareWorkspace,
  diffStat,
  detectChecks,
  commitAll,
  pushBranch,
  runChecks,
  hasRegression,
  type TestRun,
} from "./workspace.js";
import { runPlanner } from "../agents/planner.js";
import { runCoder } from "../agents/coder.js";
import { runTester } from "../agents/tester.js";
import { runReviewer } from "../agents/reviewer.js";
import { openPr } from "../github/pr.js";
import { resolveGithubToken } from "../github/auth.js";

const log = (taskId: string, msg: string) => console.log(`[${taskId.slice(0, 8)}] ${msg}`);

function pathAllowed(file: string, globs: string[]): boolean {
  if (globs.length === 0) return true; // planner left it open
  return globs.some((g) => minimatch(file, g, { matchBase: true, nocase: true }));
}

/** one-line "test:ok build:FAIL boot:ok" from a runChecks result */
function describeChecks(run: TestRun): string {
  if (!run.phases?.length) return run.passed ? "pass" : "fail";
  return run.phases.map((p) => `${p.name}:${p.passed ? "ok" : "FAIL"}`).join(" ");
}

export interface PipelineResult {
  taskId: string;
  status: string;
  prMode?: "fast_approve" | "flagged_review";
  prUrl?: string;
}

export interface PipelineOptions {
  /** GitHub App installation id from the webhook payload; enables PR creation */
  installationId?: number;
}

/**
 * The coordinator (md 3): plain orchestration, not an LLM. Runs the four agents
 * in sequence, writes a signed task_attempt after each handoff, applies the
 * reputation gate between Planner and Coder, and opens the PR the way the
 * Reviewer decided. It never merges.
 */
export async function runPipeline(taskId: string, opts: PipelineOptions = {}): Promise<PipelineResult> {
  const keys = await loadAgentKeys(config.agentKeysPath());
  const agents = await loadAgents();
  let task = await getTask(taskId);
  if (!task.repo) throw new Error(`task ${taskId} has no repo`);
  const repo = task.repo;
  const org = (task as { org_slug?: string }).org_slug ?? config.orgSlug();
  const policy = await loadPolicy(repo, org);
  const token = await resolveGithubToken(opts.installationId, repo);
  log(taskId, `policy: threshold ${policy.trustThreshold}, minHistory ${policy.minHistory}, org ${org}`);

  if (config.sandbox() === "docker" && !(await sandboxAvailable())) {
    log(taskId, "⚠️ SANDBOX=docker but the Docker daemon is unreachable — test runs fall back to the host");
  } else {
    log(taskId, `sandbox: ${config.sandbox()}`);
  }

  // ---- PLAN -------------------------------------------------------------
  await patchTask(taskId, { status: "planning" });
  log(taskId, "planning");
  const plan = await runPlanner({
    issueTitle: task.issue_title ?? "",
    issueBody: task.issue_body ?? "",
    repo,
  });

  task = await patchTask(taskId, { task_type: plan.taskType });
  const planAttempt = await recordAttempt({
    task,
    step: "plan",
    agentKey: keys.planner,
    agentId: agents.planner.id,
    parentAttemptId: null,
    scopeDeclared: plan.scopeDeclared,
    scopeAdhered: null,
    outcome: plan.outcome,
    confidence: plan.confidence,
    detail: plan.detail,
  });

  if (plan.outcome !== "passed") {
    await patchTask(taskId, { status: "failed" });
    return { taskId, status: "failed" };
  }
  const plannerSaysSensitive = Boolean((plan.detail as any).sensitiveArea);
  const sensitiveByPath = touchesSensitivePath(plan.allowedPaths, policy);
  const sensitiveArea = plannerSaysSensitive || sensitiveByPath.length > 0;

  // ---- REPUTATION GATE (Planner -> Coder) ------------------------------
  const coderRepBefore = await getReputation(agents.coder.id, plan.taskType, org);
  const gate = evaluateGate({ reputation: coderRepBefore, sensitiveArea, taskType: plan.taskType, policy });
  log(taskId, `gate: ${gate.proceed ? "proceed" : "ESCALATE"} — ${gate.reason}`);

  // ---- CODE -----------------------------------------------------------
  await patchTask(taskId, { status: "coding" });
  const ws = await prepareWorkspace(taskId, repo, token);
  let codeAttempt: TaskAttemptRow;
  try {
    // Baseline: run tests + build + boot-smoke on the pristine clone BEFORE the
    // Coder touches anything, so the Tester can tell a regression from a
    // pre-existing failure.
    const checks = await detectChecks(ws.dir);
    const testCommand = checks.testCommand ?? "npm test";
    const checkPlan =
      [checks.testCommand, checks.buildCommand, checks.startCommand && `boot :${checks.port}`]
        .filter(Boolean)
        .join(" + ") || "none detected";
    log(taskId, `checks: ${checkPlan}`);
    const baseline = await runChecks(ws.dir, checks);
    log(taskId, `baseline: ${describeChecks(baseline)}`);

    log(taskId, "coding");
    const code = await runCoder({
      plan: plan.plan,
      scopeDeclared: plan.scopeDeclared,
      allowedPaths: plan.allowedPaths,
      workdir: ws.dir,
    });

    const outOfScope = code.filesChanged.filter((f) => !pathAllowed(f, plan.allowedPaths));
    const scopeAdhered = code.outcome === "passed" ? outOfScope.length === 0 : null;

    codeAttempt = await recordAttempt({
      task,
      step: "code",
      agentKey: keys.coder,
      agentId: agents.coder.id,
      parentAttemptId: planAttempt.id,
      scopeDeclared: plan.scopeDeclared,
      scopeAdhered,
      outcome: code.outcome,
      confidence: code.confidence,
      detail: { ...code.detail, filesChanged: code.filesChanged, outOfScope, gate },
    });

    if (code.outcome !== "passed") {
      await patchTask(taskId, { status: "failed" });
      await ws.cleanup();
      return { taskId, status: "failed" };
    }

    // ---- TEST -------------------------------------------------------
    await patchTask(taskId, { status: "testing" });
    log(taskId, `testing (${checkPlan})`);
    // Authoritative after-state run: tests + build + boot-smoke, compared to baseline.
    const after = await runChecks(ws.dir, checks);
    const regression = hasRegression(baseline, after);
    const newFailures = after.failures.filter((f) => !baseline.failures.includes(f));
    // A pre-existing, unrelated failure does not fail THIS task — only a regression does.
    const testPassed = after.passed || !regression;
    const testOutcome: "passed" | "failed" = testPassed ? "passed" : "failed";
    const failedPhases = (after.phases ?? []).filter((p) => !p.passed).map((p) => p.name);
    log(taskId, `checks: after=${describeChecks(after)} regression=${regression} -> ${testOutcome}`);

    // Tester agent: may install deps, narrates what tests/build/boot showed.
    const agentTest = await runTester({
      workdir: ws.dir,
      testCommand,
      baseline,
      checksSummary: `after=${describeChecks(after)}; ${
        regression ? `NEW failures: ${newFailures.join("; ")}` : "no new failures vs baseline"
      }`,
    });

    const test = {
      passed: testPassed,
      outcome: testOutcome,
      summary: after.passed
        ? "Tests pass, build succeeds, app boots."
        : regression
          ? `Regression in ${failedPhases.join(", ") || "checks"} — new failure(s): ${newFailures.join("; ")}`
          : `Pre-existing failure(s) in ${failedPhases.join(", ") || "checks"} unrelated to this change; nothing new introduced.`,
    };

    const testAttempt = await recordAttempt({
      task,
      step: "test",
      agentKey: keys.tester,
      agentId: agents.tester.id,
      parentAttemptId: codeAttempt.id,
      scopeDeclared: plan.scopeDeclared,
      scopeAdhered: true,
      outcome: testOutcome,
      confidence: null,
      detail: {
        summary: test.summary,
        agentSummary: agentTest.summary,
        baselinePassed: baseline.passed,
        afterPassed: after.passed,
        regression,
        newFailures,
        preExistingFailures: baseline.failures,
        phases: (after.phases ?? []).map((p) => ({ name: p.name, passed: p.passed })),
        checkPlan,
        testCommand,
      },
    });

    // The Planner's and Coder's work is verified downstream by the tester (md 5).
    // Mark the plan + code attempts as verified WITHOUT touching their signed
    // outcome, then recompute — recompute_reputation scores them by whether the
    // task reached a passing test.
    await db()
      .from("task_attempts")
      .update({ verified_by: "tests" })
      .in("id", [planAttempt.id, codeAttempt.id]);
    await db().rpc("recompute_reputation", { p_agent: agents.coder.id, p_task_type: plan.taskType, p_org: org });
    await db().rpc("recompute_reputation", { p_agent: agents.planner.id, p_task_type: plan.taskType, p_org: org });

    // ---- REVIEW ---------------------------------------------------
    await patchTask(taskId, { status: "reviewing" });
    const { files, stat, patch } = await diffStat(ws.dir);
    const coderRepAfter = await getReputation(agents.coder.id, plan.taskType, org);
    log(taskId, "reviewing");
    const review = await runReviewer({
      issueTitle: task.issue_title ?? "",
      scopeDeclared: plan.scopeDeclared,
      diff: patch,
      filesChanged: files,
      testsPassed: test.passed,
      testSummary: test.summary,
      coderReputation: coderRepAfter.score,
      coderHasHistory: coderRepAfter.hasHistory,
      sensitiveArea,
    });

    // The coordinator overrides the Reviewer toward caution when hard signals say so.
    let prMode = review.prMode;
    const forced: string[] = [];
    if (!gate.proceed) forced.push(`gate: ${gate.reason}`);
    if (!test.passed) forced.push("tests failed");
    if (scopeAdhered === false) forced.push(`out-of-scope edits: ${outOfScope.join(", ")}`);
    if (review.scopeAdhered === false) forced.push("reviewer: diff outside declared scope");
    if (forced.length) prMode = "flagged_review";

    const concerns = [...review.concerns, ...forced];

    await recordAttempt({
      task,
      step: "review",
      agentKey: keys.reviewer,
      agentId: agents.reviewer.id,
      parentAttemptId: testAttempt.id,
      scopeDeclared: plan.scopeDeclared,
      scopeAdhered: review.scopeAdhered,
      outcome: prMode === "fast_approve" ? "passed" : "escalated",
      confidence: review.confidence,
      detail: { summary: review.summary, concerns, prMode, forced, diffStat: stat },
    });

    // ---- OPEN PR (or stop at a decision packet) ------------------
    await patchTask(taskId, { pr_mode: prMode });

    if (!token) {
      log(taskId, `no GitHub credentials — decision packet ready (${prMode}), PR not opened`);
      await patchTask(taskId, { status: prMode === "fast_approve" ? "reviewing" : "escalated" });
      await ws.cleanup();
      return { taskId, status: prMode === "fast_approve" ? "reviewing" : "escalated", prMode };
    }

    await commitAll(ws.dir, `${task.issue_title ?? "Relay fix"}\n\nScope: ${plan.scopeDeclared}`);
    await pushBranch(ws.dir, ws.branch);
    const pr = await openPr({
      token,
      repo,
      branch: ws.branch,
      title: task.issue_title ?? "Relay fix",
      mode: prMode,
      issueNumber: task.issue_number,
      reviewerSummary: review.summary,
      concerns,
      scopeDeclared: plan.scopeDeclared,
      diffStat: stat,
      testsPassed: test.passed,
      testSummary: test.summary,
      coderReputation: coderRepAfter.score,
    });

    await patchTask(taskId, { status: "pr_opened", pr_number: pr.number, pr_url: pr.url });
    log(taskId, `PR #${pr.number} opened (${prMode}) ${pr.url}`);

    // Escalations reach humans where they work (md 6·5)
    void notifyEscalation({
      taskId,
      repo,
      issueTitle: task.issue_title ?? "Relay fix",
      issueNumber: task.issue_number,
      taskType: plan.taskType,
      prMode,
      prUrl: pr.url,
      prNumber: pr.number,
      reviewerSummary: review.summary,
      concerns,
      coderReputation: coderRepAfter.score,
      testsPassed: test.passed,
    });

    await ws.cleanup();
    return { taskId, status: "pr_opened", prMode, prUrl: pr.url };
  } catch (err) {
    await patchTask(taskId, { status: "failed" });
    await ws.cleanup().catch(() => {});
    throw err;
  }
}
