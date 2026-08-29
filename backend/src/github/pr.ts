import { octokitWithToken } from "./auth.js";
import type { PrMode } from "../db/types.js";

export interface OpenPrInput {
  /** installation or PAT token with contents:write + pull-requests:write */
  token: string;
  repo: string; // owner/name
  branch: string;
  baseBranch?: string;
  title: string;
  mode: PrMode;
  issueNumber?: number | null;
  reviewerSummary: string;
  concerns: string[];
  scopeDeclared: string;
  diffStat: string;
  testsPassed: boolean;
  testSummary: string;
  coderReputation: number;
}

export interface OpenPrResult {
  number: number;
  url: string;
}

function body(i: OpenPrInput): string {
  const head =
    i.mode === "fast_approve"
      ? "## ✅ Fast-approve request\nHigh confidence, in scope, tests pass. Your job is confirmation, not investigation."
      : "## 🚩 Flagged review request\nRelay is not confident enough to suggest a quick approve. Please review before merging.";

  const concerns = i.concerns.length
    ? i.concerns.map((c) => `- ${c}`).join("\n")
    : "_none_";

  return [
    head,
    "",
    i.issueNumber ? `Closes #${i.issueNumber}` : "",
    "",
    "### Reviewer summary",
    i.reviewerSummary,
    "",
    "### What Relay is unsure about",
    concerns,
    "",
    "### Declared scope",
    i.scopeDeclared,
    "",
    "### Changes",
    "```",
    i.diffStat || "(no stat)",
    "```",
    "",
    "### Tests",
    `${i.testsPassed ? "PASS" : "FAIL"} — ${i.testSummary}`,
    "",
    "### Trust",
    `Coder reputation for this task type: **${i.coderReputation.toFixed(2)}**`,
    "",
    "---",
    "_Opened by Relay. A human makes the final merge decision — Relay never merges on its own._",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export async function openPr(input: OpenPrInput): Promise<OpenPrResult> {
  const [owner, name] = input.repo.split("/");
  const octokit = octokitWithToken(input.token);

  const base =
    input.baseBranch ??
    (await octokit.repos.get({ owner, repo: name })).data.default_branch;

  const pr = await octokit.pulls.create({
    owner,
    repo: name,
    head: input.branch,
    base,
    title: input.title,
    body: body(input),
    draft: input.mode === "flagged_review",
  });

  const label = input.mode === "fast_approve" ? "relay:fast-approve" : "relay:flagged-review";
  await octokit.issues
    .addLabels({ owner, repo: name, issue_number: pr.data.number, labels: [label] })
    .catch(() => {/* labels are best-effort */});

  return { number: pr.data.number, url: pr.data.html_url };
}
