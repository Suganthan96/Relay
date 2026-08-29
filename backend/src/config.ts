import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var ${name} — copy .env.example to .env`);
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  supabaseUrl: () => required("SUPABASE_URL"),
  supabaseServiceKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseAnonKey: () => optional("SUPABASE_ANON_KEY"),

  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),
  claudeCliPath: () => optional("CLAUDE_CLI_PATH", "claude"),

  githubToken: () => required("GITHUB_TOKEN"),
  githubRepo: () => required("GITHUB_REPO"),
  githubWebhookSecret: () => optional("GITHUB_WEBHOOK_SECRET"),

  agentKeysPath: () => optional("AGENT_KEYS_PATH", "./.keys/agents.json"),
  workspaceDir: () => optional("WORKSPACE_DIR", "./.workspace"),
  port: () => Number(optional("PORT", "8787")),
};
