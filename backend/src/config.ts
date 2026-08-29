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
};
