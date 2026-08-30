import { db } from "../db/client.js";
import { loadAgents } from "../db/agents.js";
import { getTask, patchTask } from "../db/tasks.js";
import { recordAttempt } from "../db/attempts.js";
import { loadAgentKeys } from "../identity/keys.js";
import { config } from "../config.js";
import { resolveGithubToken, octokitWithToken } from "../github/auth.js";

export interface DecisionInput {
  taskId: string;
  decision: "approve" | "reject";
  note?: string;
  installationId?: number;
}

export interface DecisionResult {
  taskId: string;
  status: string;
  merged: boolean;
}

/**
 * The human-in-the-loop action (md 3): a person approves or rejects. Relay
 * records it as a signed human_override attempt, merges the PR on approve (it
 * never merges on its own — this is the human's click), sets the task's terminal
 * status, and feeds the signal back into the Coder's reputation.
 */
export async function applyDecision(input: DecisionInput): Promise<DecisionResult> {
  const task = await getTask(input.taskId);
  const agents = await loadAgents();
  const keys = await loadAgentKeys(config.agentKeysPath());
  const approve = input.decision === "approve";
  const org = (task as { org_slug?: string }).org_slug ?? config.orgSlug();

  const { data: review } = await db()
    .from("task_attempts")
    .select("id")
    .eq("task_id", task.id)
    .eq("step", "review")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await recordAttempt({
    task,
    step: "review",
    agentKey: keys.reviewer,
    agentId: agents.reviewer.id,
    parentAttemptId: review?.id ?? null,
    scopeDeclared: "human decision",
    scopeAdhered: null,
    outcome: "human_override",
    confidence: null,
    verifiedBy: "human",
    detail: { decision: input.decision, note: input.note ?? null },
  });

  let merged = false;
  if (task.pr_number && task.repo) {
    const token = await resolveGithubToken(input.installationId, task.repo);
    if (token) {
      const [owner, name] = task.repo.split("/");
      const gh = octokitWithToken(token);
      const issue = task.issue_number ?? undefined;
      try {
        if (approve) {
          // The human's click — Relay never merges on its own. The PR body's
          // `Closes #<issue>` makes GitHub close the linked issue on merge.
          await gh.pulls.merge({
            owner, repo: name, pull_number: task.pr_number, merge_method: "squash",
          });
          merged = true;
          if (issue)
            await gh.issues
              .createComment({ owner, repo: name, issue_number: issue,
                body: `✅ Fixed and merged via #${task.pr_number} (approved by a human).` })
              .catch(() => {});
        } else {
          // Reject: close the PR, leave the issue open, remove the in-review label.
          await gh.pulls.update({
            owner, repo: name, pull_number: task.pr_number, state: "closed",
          });
          if (issue) {
            await gh.issues
              .createComment({ owner, repo: name, issue_number: issue,
                body: `🚫 Relay's fix in #${task.pr_number} was rejected by a human. The issue stays open.` })
              .catch(() => {});
            await gh.issues
              .removeLabel({ owner, repo: name, issue_number: issue, name: "relay:in-review" })
              .catch(() => {});
          }
        }
      } catch (e) {
        console.error(`${input.decision} PR #${task.pr_number} failed:`, (e as Error).message);
      }
    }
  }

  await patchTask(task.id, { status: approve ? "merged" : "rejected" });

  // The human's merge decision validates (or invalidates) the whole chain —
  // feed it into the Planner's and Coder's trust score for this task_type.
  for (const agentId of [agents.planner.id, agents.coder.id]) {
    await db().rpc("apply_human_signal", {
      p_agent: agentId,
      p_task_type: task.task_type,
      p_success: approve,
      p_org: org,
    });
  }

  return { taskId: task.id, status: approve ? "merged" : "rejected", merged };
}
