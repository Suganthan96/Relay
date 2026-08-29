import "dotenv/config";
import express from "express";
import { createNodeMiddleware } from "@octokit/webhooks";
import { config } from "./config.js";
import { githubApp } from "./github/auth.js";
import { createTask } from "./db/tasks.js";
import { runPipeline } from "./coordinator/pipeline.js";

/**
 * GitHub App webhook receiver (md 3: "Webhook / Poller → creates task record").
 * On `issues.opened` it creates a task and kicks off the pipeline; the pipeline
 * runs detached so GitHub gets a fast 2xx.
 *
 *   npm run serve      # POST /webhook
 *
 * Point the App's webhook at  https://<public-host>/webhook  (use a tunnel like
 * `cloudflared` / `ngrok` for local dev). Events needed: Issues.
 */
const app = githubApp();
if (!app) {
  throw new Error(
    "GitHub App not configured — set GITHUB_APP_ID, GITHUB_PRIVATE_KEY_PATH, GITHUB_WEBHOOK_SECRET in .env",
  );
}

// Optional filter: only act on issues carrying this label. Empty = every issue.
const LABEL = (process.env.RELAY_ISSUE_LABEL ?? "").trim();

app.webhooks.on("issues.opened", async ({ payload }) => {
  const repo = payload.repository.full_name;
  const installationId = payload.installation?.id;
  const { number, title, body, labels } = payload.issue;

  if (LABEL && !(labels ?? []).some((l) => (typeof l === "string" ? l : l.name) === LABEL)) {
    console.log(`skip #${number} on ${repo} — no "${LABEL}" label`);
    return;
  }

  console.log(`issue #${number} opened on ${repo} — creating task`);
  const task = await createTask({
    issueNumber: number,
    issueTitle: title,
    issueBody: body ?? "",
    repo,
  });

  // Detached: don't hold the webhook response open for a multi-minute pipeline.
  void runPipeline(task.id, { installationId })
    .then((r) => console.log(`task ${task.id} -> ${r.status}${r.prUrl ? ` ${r.prUrl}` : ""}`))
    .catch((e) => console.error(`task ${task.id} pipeline failed:`, e));
});

app.webhooks.onAny(({ id, name }) => console.log(`webhook ${name} (${id})`));
app.webhooks.onError((e) => console.error("webhook error:", e.message));

const server = express();
server.get("/health", (_req, res) => res.json({ ok: true }));
server.use(createNodeMiddleware(app.webhooks, { path: "/webhook" }));

const port = config.port();
server.listen(port, () => console.log(`Relay webhook listening on :${port}/webhook`));
