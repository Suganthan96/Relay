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

/**
 * Resolve a token usable for both git and the REST API, or null when GitHub is
 * not configured (the pipeline then stops at a signed decision packet).
 */
export async function resolveGithubToken(installationId?: number): Promise<string | null> {
  if (installationId != null && config.hasGithubApp()) {
    return installationToken(installationId);
  }
  return config.optionalGithubToken() || null;
}

export function octokitWithToken(token: string): Octokit {
  return new Octokit({ auth: token });
}
