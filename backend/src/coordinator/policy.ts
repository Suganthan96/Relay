import { db } from "../db/client.js";

/**
 * Per-team trust policy (md 6·3). Relay computes the trust number; the policy
 * decides what to do with it. One row per repo in `relay_policies`, plus a '*'
 * default row. `loadPolicy` returns the repo's row merged over the default.
 */
export interface Policy {
  repo: string;
  trustThreshold: number;
  minHistory: number;
  sensitivePaths: string[];
  autoApproveTaskTypes: string[];
  alwaysFlagTaskTypes: string[];
}

const FALLBACK: Policy = {
  repo: "*",
  trustThreshold: 0.8,
  minHistory: 3,
  sensitivePaths: ["auth", "payment", "payments", "security", "secret", "secrets", "migration", "migrations", ".github/workflows"],
  autoApproveTaskTypes: ["css-fix", "docs", "copy"],
  alwaysFlagTaskTypes: ["auth", "payments"],
};

function fromRow(r: Record<string, unknown>): Policy {
  return {
    repo: String(r.repo ?? "*"),
    trustThreshold: Number(r.trust_threshold ?? FALLBACK.trustThreshold),
    minHistory: Number(r.min_history ?? FALLBACK.minHistory),
    sensitivePaths: (r.sensitive_paths as string[]) ?? FALLBACK.sensitivePaths,
    autoApproveTaskTypes: (r.auto_approve_task_types as string[]) ?? FALLBACK.autoApproveTaskTypes,
    alwaysFlagTaskTypes: (r.always_flag_task_types as string[]) ?? FALLBACK.alwaysFlagTaskTypes,
  };
}

export async function loadPolicy(repo: string, orgSlug = "default"): Promise<Policy> {
  try {
    const { data, error } = await db()
      .from("relay_policies")
      .select("*")
      .in("repo", [repo, "*"])
      .eq("org_slug", orgSlug);
    if (error || !data?.length) return FALLBACK;
    const exact = data.find((r) => r.repo === repo);
    return fromRow(exact ?? data[0]);
  } catch {
    return FALLBACK;
  }
}

/** does any changed path look sensitive under this policy? */
export function touchesSensitivePath(files: string[], policy: Policy): string[] {
  const lc = policy.sensitivePaths.map((p) => p.toLowerCase());
  return files.filter((f) => lc.some((p) => f.toLowerCase().includes(p)));
}
