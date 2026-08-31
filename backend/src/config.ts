import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var ${name} — copy .env.example to .env`);
  return v;
}

function optional(name: string, fallback = ""): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : fallback;
}

export const config = {
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseAnonKey: () => optional("SUPABASE_ANON_KEY"),

  claudeCliPath: () => optional("CLAUDE_CLI_PATH", "claude"),

  // --- GitHub ---
  // Preferred: a GitHub App (per-installation tokens; repo comes from the webhook).
  githubAppId: () => required("GITHUB_APP_ID"),
  githubPrivateKeyPath: () => required("GITHUB_PRIVATE_KEY_PATH"),
  githubWebhookSecret: () => required("GITHUB_WEBHOOK_SECRET"),
  hasGithubApp: () =>
    Boolean(optional("GITHUB_APP_ID") && optional("GITHUB_PRIVATE_KEY_PATH")),

  // Fallback: a personal access token + a fixed repo (used by the manual CLI).
  optionalGithubToken: () => optional("GITHUB_TOKEN"),
  optionalGithubRepo: () => optional("GITHUB_REPO"),

  /** can the pipeline actually open a PR (vs. stop at a decision packet)? */
  hasGithub: () =>
    Boolean(
      (optional("GITHUB_APP_ID") && optional("GITHUB_PRIVATE_KEY_PATH")) ||
        (optional("GITHUB_TOKEN") && optional("GITHUB_REPO")),
    ),

  agentKeysPath: () => optional("AGENT_KEYS_PATH", "./.keys/agents.json"),
  workspaceDir: () => optional("WORKSPACE_DIR", "./.workspace"),
  port: () => Number(optional("PORT", "8787")),

  // --- multi-org (md 6·6) ---
  /** org every task this instance creates belongs to */
  orgSlug: () => optional("RELAY_ORG", "default"),
  /** when true, dashboard reads are expected to carry an x-relay-org header */
  enforceOrg: () => optional("RELAY_ENFORCE_ORG") === "true",

  // --- sandbox (md 6·2) ---
  /** 'local' (clone on this host) or 'docker' (throwaway --network none container) */
  sandbox: () => optional("SANDBOX", "local") as "local" | "docker",
  sandboxImage: () => optional("SANDBOX_IMAGE", "relay-sandbox:latest"),
  /** run the build + boot-and-HTTP-smoke checks in the Tester (default on) */
  smoke: () => optional("RELAY_SMOKE", "true") !== "false",

  // --- escalation notifications (md 6·5) ---
  slackWebhookUrl: () => optional("SLACK_WEBHOOK_URL"),
  notifyWebhookUrl: () => optional("RELAY_NOTIFY_WEBHOOK"),
  dashboardUrl: () => optional("RELAY_DASHBOARD_URL", "http://localhost:3000"),
};
