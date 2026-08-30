import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm, readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "../config.js";

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

export interface Workspace {
  dir: string;
  branch: string;
  cleanup: () => Promise<void>;
}

/**
 * Clone the target repo into an ephemeral working dir and cut a branch for the
 * task (md 6: "isolated, ephemeral" — here a local clone; a container in prod).
 * `token` (installation or PAT) is embedded in the clone URL so push works too.
 */
export async function prepareWorkspace(
  taskId: string,
  repo: string,
  token?: string | null,
): Promise<Workspace> {
  const root = resolve(config.workspaceDir());
  await mkdir(root, { recursive: true });
  const dir = join(root, taskId);
  await rm(dir, { recursive: true, force: true });

  // `repo` is normally owner/name on github.com, but a local path or file:// URL
  // is accepted too — handy for tests and for self-hosted mirrors.
  const isLocal =
    repo.startsWith("file:") || repo.startsWith(".") || repo.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(repo);
  let source: string;
  if (isLocal) {
    source = repo.startsWith("file:") ? repo : resolve(repo);
  } else {
    source = token
      ? `https://x-access-token:${token}@github.com/${repo}.git`
      : `https://github.com/${repo}.git`;
  }

  await git(root, ["clone", "--depth", "1", source, dir]);

  const branch = `relay/${taskId.slice(0, 8)}`;
  await git(dir, ["checkout", "-b", branch]);
  await git(dir, ["config", "user.email", "relay@localhost"]);
  await git(dir, ["config", "user.name", "Relay"]);

  return {
    dir,
    branch,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

export async function diffStat(dir: string): Promise<{ files: string[]; stat: string; patch: string }> {
  await git(dir, ["add", "-A"]);
  const stat = (await git(dir, ["diff", "--cached", "--stat"])).trim();
  const nameOnly = (await git(dir, ["diff", "--cached", "--name-only"])).trim();
  const patch = await git(dir, ["diff", "--cached"]);
  return { files: nameOnly ? nameOnly.split(/\r?\n/) : [], stat, patch };
}

export async function commitAll(dir: string, message: string): Promise<void> {
  await git(dir, ["add", "-A"]);
  await git(dir, ["commit", "-m", message, "--no-verify"]);
}

export async function pushBranch(dir: string, branch: string): Promise<void> {
  await git(dir, ["push", "-u", "origin", branch]);
}

/** Read the project's test command from package.json, if any. */
export async function detectTestCommand(dir: string): Promise<string | null> {
  try {
    await access(join(dir, "package.json"));
    const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
    if (pkg.scripts?.test && !/no test specified/i.test(pkg.scripts.test)) return "npm test";
  } catch {
    /* not a node project */
  }
  return null;
}

export interface TestRun {
  passed: boolean;
  code: number | null;
  output: string;
  /** normalized set of failure lines, for baseline-vs-after comparison */
  failures: string[];
}

const FAILURE_RE = /\b(FAIL|FAILED|failing|not ok|AssertionError|Error:|✕|✗|✘)\b/i;

/**
 * Run the project's test command directly (no agent) and capture the result.
 * Used to take a BASELINE on the pristine clone before the Coder touches
 * anything, so the Tester can tell a regression from a pre-existing failure.
 */
export async function runTestCommand(dir: string, command: string): Promise<TestRun> {
  const [bin, ...args] = command.split(" ");
  try {
    const { stdout, stderr } = await exec(bin, args, {
      cwd: dir,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 300_000,
      shell: process.platform === "win32",
    });
    const output = (stdout + stderr).trim();
    return { passed: true, code: 0, output, failures: extractFailures(output) };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string; message?: string };
    const output = ((err.stdout ?? "") + (err.stderr ?? "") + (err.message ?? "")).trim();
    return {
      passed: false,
      code: typeof err.code === "number" ? err.code : null,
      output,
      failures: extractFailures(output),
    };
  }
}

function extractFailures(output: string): string[] {
  return [
    ...new Set(
      output
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && FAILURE_RE.test(l))
        .map((l) => l.replace(/\s+/g, " ").slice(0, 200)),
    ),
  ].sort();
}

/** true when `after` contains a failure line that was NOT present in `baseline`. */
export function hasRegression(baseline: TestRun, after: TestRun): boolean {
  if (after.passed) return false;
  if (!baseline.passed && after.failures.length === 0) return true; // suite broke differently
  const base = new Set(baseline.failures);
  return after.failures.some((f) => !base.has(f));
}
