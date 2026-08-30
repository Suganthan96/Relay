import { readFileSync } from "node:fs";
import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";
import { config } from "../config.js";

/**
 * GitHub auth for Relay. Two modes:
 *   - GitHub App  (preferred): the webhook payload carries an installation id;
 *     we mint a short-lived installation token per task for clone / push / PR.
 *   - PAT         (fallback): a personal access token + a fixed GITHUB_REPO,
 *     used by the manual `pipeline` CLI when no App is configured.
 */

let cachedApp: App | null = null;

export function githubApp(): App | null {
  if (!config.hasGithubApp()) return null;
  if (!cachedApp) {
    const keyPath = config.githubPrivateKeyPath();
    let privateKey: string;
    try {
      privateKey = readFileSync(keyPath, "utf8");
    } catch {
      throw new Error(
        `cannot read GITHUB_PRIVATE_KEY_PATH (${keyPath}) — download the App's ` +
          `private key .pem and place it there`,
      );
    }
    cachedApp = new App({
      appId: config.githubAppId(),
      privateKey,
      webhooks: { secret: config.githubWebhookSecret() },
    });
  }
  return cachedApp;
}

/** An installation access token (`ghs_...`) — valid for clone URLs and Octokit. */
export async function installationToken(installationId: number): Promise<string> {
  const app = githubApp();
  if (!app) throw new Error("GitHub App is not configured");
  const octokit = await app.getInstallationOctokit(installationId);
  const auth = (await octokit.auth({ type: "installation" })) as { token: string };
  return auth.token;
}

/** Find the installation id that covers `owner/name`, so the CLI works too. */
export async function installationIdForRepo(repo: string): Promise<number | null> {
  const app = githubApp();
  if (!app) return null;
  const owner = repo.split("/")[0].toLowerCase();
  const { data } = await app.octokit.request("GET /app/installations");
  const byAccount = data.find((i) => (i.account as { login?: string } | null)?.login?.toLowerCase() === owner);
  return (byAccount ?? data[0])?.id ?? null;
}

/**
 * Resolve a token usable for both git and the REST API, or null when GitHub is
 * not configured (the pipeline then stops at a signed decision packet).
 *
 * Priority: explicit installation id (from a webhook) → App installation that
 * covers `repo` → PAT.
 */
export async function resolveGithubToken(
  installationId?: number,
  repo?: string,
): Promise<string | null> {
  if (config.hasGithubApp()) {
    const id = installationId ?? (repo && !isLocalRepo(repo) ? await installationIdForRepo(repo) : null);
    if (id != null) return installationToken(id);
  }
  return config.optionalGithubToken() || null;
}

function isLocalRepo(repo: string): boolean {
  return repo.startsWith("file:") || repo.startsWith(".") || repo.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(repo);
}

export function octokitWithToken(token: string): Octokit {
  return new Octokit({ auth: token });
}
