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

  // Not opened as a draft even when flagged: the "flag" is carried by the PR
  // body header + label + the dashboard, and a draft PR cannot be merged via the
  // API when the human clicks Approve.
  const pr = await octokit.pulls.create({
    owner,
    repo: name,
    head: input.branch,
    base,
    title: input.mode === "flagged_review" ? `🚩 ${input.title}` : input.title,
    body: body(input), // body contains `Closes #<issue>` -> issue auto-closes on merge
  });

  const label = input.mode === "fast_approve" ? "relay:fast-approve" : "relay:flagged-review";
  // label + link-back on the PR *and* the issue
  await octokit.issues
    .addLabels({ owner, repo: name, issue_number: pr.data.number, labels: [label] })
    .catch(() => {});

  if (input.issueNumber) {
    const note =
      input.mode === "fast_approve"
        ? `🤖 Relay prepared a fix in #${pr.data.number} — tests pass, in scope. ` +
          `A human clicks **Approve & merge** to ship it (Relay never merges on its own).`
        : `🤖 Relay prepared a fix in #${pr.data.number} — flagged for review. ` +
          `A human decides on the Approvals page.`;
    await octokit.issues
      .createComment({ owner, repo: name, issue_number: input.issueNumber, body: note })
      .catch(() => {});
    await octokit.issues
      .addLabels({ owner, repo: name, issue_number: input.issueNumber, labels: ["relay:in-review"] })
      .catch(() => {});
  }

  return { number: pr.data.number, url: pr.data.html_url };
}
