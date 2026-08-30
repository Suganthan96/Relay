import { config } from "../config.js";

/**
 * Escalations reach humans where they work (md 6·5). A flagged review posts a
 * message to Slack (SLACK_WEBHOOK_URL) and/or a generic outbound webhook
 * (RELAY_NOTIFY_WEBHOOK). Both are best-effort and no-op when unset.
 */
export interface EscalationNotice {
  taskId: string;
  repo: string;
  issueTitle: string;
  issueNumber?: number | null;
  taskType: string;
  prMode: "fast_approve" | "flagged_review";
  prUrl?: string;
  prNumber?: number;
  reviewerSummary: string;
  concerns: string[];
  coderReputation: number;
  testsPassed: boolean;
}

export async function notifyEscalation(n: EscalationNotice): Promise<void> {
  const approvals = `${config.dashboardUrl()}/approvals`;
  const flagged = n.prMode === "flagged_review";
  const headline = flagged
    ? `🚩 Relay flagged a fix for review — ${n.repo}`
    : `✅ Relay fix ready to fast-approve — ${n.repo}`;

  const lines = [
    headline,
    `*${n.issueTitle}*  (${n.taskType})`,
    n.prUrl ? `PR: ${n.prUrl}` : "",
    `Tests: ${n.testsPassed ? "PASS" : "FAIL"}   Coder trust: ${n.coderReputation.toFixed(2)}`,
    "",
    n.reviewerSummary,
    n.concerns.length ? "\n*What Relay is unsure about:*\n" + n.concerns.map((c) => `• ${c}`).join("\n") : "",
    "",
    `Decide → ${approvals}`,
  ].filter(Boolean);

  const text = lines.join("\n");

  await Promise.allSettled([
    postSlack(text),
    postWebhook({ ...n, dashboardUrl: approvals, text }),
  ]);
}

async function postSlack(text: string): Promise<void> {
  const url = config.slackWebhookUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error("slack notify failed:", (e as Error).message);
  }
}

async function postWebhook(payload: unknown): Promise<void> {
  const url = config.notifyWebhookUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("notify webhook failed:", (e as Error).message);
  }
}
