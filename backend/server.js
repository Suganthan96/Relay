// server.js
import "dotenv/config";
import { App } from "@octokit/app";
import { createNodeMiddleware } from "@octokit/webhooks";
import fs from "fs";
import express from "express";

const app = new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: fs.readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH, "utf8"),
  webhooks: { secret: process.env.GITHUB_WEBHOOK_SECRET },
});
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught exception:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("💥 Unhandled rejection:", err);
});

app.webhooks.onAny(({ id, name }) => {
  console.log(`📨 Received event: ${name} (${id})`);
});

app.webhooks.on("issues.opened", ({ payload }) => {
  console.log("✅ Issue opened:", payload.issue.title);
  console.log("   Repo:", payload.repository.full_name);
  console.log("   Body:", payload.issue.body);
});

const server = express();
server.use(createNodeMiddleware(app.webhooks, { path: "/webhook" }));
server.listen(3000, () => console.log("🚀 Listening on :3000"));