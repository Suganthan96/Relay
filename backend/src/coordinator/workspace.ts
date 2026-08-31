import { execFile, spawn } from "node:child_process";
import http from "node:http";
import { promisify } from "node:util";
import { mkdir, rm, readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "../config.js";
import { runInSandbox } from "./sandbox.js";

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

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
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

export interface ProjectChecks {
  /** `npm test` when a real test script exists */
  testCommand: string | null;
  /** `npm run build` / `typecheck` / `npx tsc --noEmit` — catches broken imports & types */
  buildCommand: string | null;
  /** `npm run dev|start|preview|serve` — booted for the HTTP smoke test */
  startCommand: string | null;
  installCommand: string;
  needsInstall: boolean;
  /** port the booted server is expected on */
  port: number;
  isNode: boolean;
}

/**
 * Work out what "does this repo still work" means for the cloned project:
 * run its tests, make sure it still builds, and — if it's a web app — boot it
 * and hit it over HTTP. All three go through the baseline diff so a repo that
 * was already broken doesn't fail the task.
 */
export async function detectChecks(dir: string): Promise<ProjectChecks> {
  const base: ProjectChecks = {
    testCommand: null,
    buildCommand: null,
    startCommand: null,
    installCommand: "npm install",
    needsInstall: false,
    port: 3000,
    isNode: false,
  };
  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  } catch {
    return base;
  }
  const s = pkg.scripts ?? {};
  const has = (n: string) => typeof s[n] === "string" && s[n].trim().length > 0;

  base.isNode = true;
  base.needsInstall = !(await exists(join(dir, "node_modules")));
  base.installCommand = (await exists(join(dir, "package-lock.json"))) ? "npm ci" : "npm install";

  base.testCommand = has("test") && !/no test specified/i.test(s.test) ? "npm test" : null;

  if (config.smoke()) {
    if (has("build")) base.buildCommand = "npm run build";
    else if (has("typecheck")) base.buildCommand = "npm run typecheck";
    else if (has("tsc")) base.buildCommand = "npm run tsc";
    else if (await exists(join(dir, "tsconfig.json"))) base.buildCommand = "npx --yes tsc --noEmit";

    const startName = ["dev", "start", "preview", "serve"].find((n) => has(n));
    if (startName) {
      base.startCommand = `npm run ${startName}`;
      const script = s[startName];
      const m = script.match(/(?:-p\b|--port\b|PORT[=\s])\s*(\d{2,5})/i);
      if (m) base.port = Number(m[1]);
      else if (/vite/.test(script) && startName === "preview") base.port = 4173;
      else if (/vite/.test(script)) base.port = 5173;
      else if (/astro/.test(script)) base.port = 4321;
    }
  }
  return base;
}

export interface PhaseResult {
  name: "test" | "build" | "boot";
  passed: boolean;
  /** raw phase output, failure lines already tagged with `[name]` */
  output: string;
}

export interface TestRun {
  passed: boolean;
  code: number | null;
  output: string;
  /** normalized set of failure lines, for baseline-vs-after comparison */
  failures: string[];
  /** per-phase breakdown when produced by runChecks */
  phases?: PhaseResult[];
}

const FAILURE_RE = /\b(FAIL|FAILED|failing|not ok|AssertionError|Error:|error TS\d|✕|✗|✘)\b/i;

/**
 * Run the project's test command and capture the result. Goes through the
 * sandbox (md 6·2): SANDBOX=docker runs it in a throwaway `--network none`
 * container so the repo's own scripts (postinstall, test) can't touch the host.
 * Used for the BASELINE (pristine clone) and the authoritative after-run.
 */
export async function runTestCommand(dir: string, command: string): Promise<TestRun> {
  const r = await runInSandbox({ dir, command, network: true, timeoutMs: 300_000 });
  const output = (r.stdout + r.stderr).trim();
  const passed = r.code === 0;
  return { passed, code: r.code, output, failures: extractFailures(output, "test") };
}

/**
 * Full "still works?" check: install -> test -> build -> boot + HTTP smoke.
 * Every phase runs on the pristine clone for the baseline and again after the
 * Coder's change; hasRegression() then only fails the task on a NEW failure in
 * any phase (a new test failure, a newly broken build, a route that stopped
 * answering). The boot phase runs on the host even in docker mode.
 */
export async function runChecks(dir: string, checks: ProjectChecks): Promise<TestRun> {
  const phases: PhaseResult[] = [];

  if (checks.needsInstall) {
    // deps are needed for build/boot; a flaky install isn't itself a graded phase
    await runInSandbox({ dir, command: checks.installCommand, network: true, timeoutMs: 300_000 }).catch(
      () => undefined,
    );
  }

  if (checks.testCommand) {
    const r = await runInSandbox({ dir, command: checks.testCommand, network: true, timeoutMs: 300_000 });
    phases.push({ name: "test", passed: r.code === 0, output: (r.stdout + r.stderr).trim() });
  }
  if (checks.buildCommand) {
    const r = await runInSandbox({ dir, command: checks.buildCommand, network: true, timeoutMs: 480_000 });
    phases.push({ name: "build", passed: r.code === 0, output: (r.stdout + r.stderr).trim() });
  }
  if (checks.startCommand) {
    const buildBroken = phases.some((p) => p.name === "build" && !p.passed);
    phases.push(
      buildBroken
        ? { name: "boot", passed: false, output: "[boot] skipped — build failed" }
        : await bootAndSmoke(dir, checks.startCommand, checks.port),
    );
  }

  const passed = phases.length === 0 || phases.every((p) => p.passed);
  const failures = phases
    .filter((p) => !p.passed)
    .flatMap((p) => {
      const ex = extractFailures(p.output, p.name);
      if (ex.length) return ex;
      const first = (p.output.split(/\r?\n/)[0] ?? "failed").trim().slice(0, 200);
      return [first.startsWith("[") ? first : `[${p.name}] ${first}`];
    });
  return {
    passed,
    code: passed ? 0 : 1,
    output: phases.map((p) => `── ${p.name} ${p.passed ? "ok" : "FAIL"} ──\n${p.output}`).join("\n\n").trim(),
    failures,
    phases,
  };
}

/**
 * Start the repo's server, wait for it to answer on 127.0.0.1:<port>, and check
 * `/` isn't a 5xx or a framework error page. Always kills the process.
 */
async function bootAndSmoke(dir: string, startCommand: string, port: number): Promise<PhaseResult> {
  const parts = startCommand.trim().split(/\s+/);
  const child = spawn(parts[0], parts.slice(1), {
    cwd: dir,
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      BROWSER: "none",
      CI: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      FORCE_COLOR: "0",
    },
  });
  let logbuf = "";
  const cap = (d: Buffer) => {
    if (logbuf.length < 20_000) logbuf += d.toString();
  };
  child.stdout?.on("data", cap);
  child.stderr?.on("data", cap);
  let exitCode: number | null | undefined;
  child.on("exit", (c) => (exitCode = c));

  const fail = (msg: string): PhaseResult => ({ name: "boot", passed: false, output: `[boot] ${msg}` });
  try {
    // give the server a moment to announce a (possibly different) port
    await sleep(2500);
    const announced = logbuf.match(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):(\d{2,5})/i);
    const target = announced ? Number(announced[1]) : port;

    const res = await waitForHttp(target, 90_000);
    const tail = logbuf.split(/\r?\n/).slice(-40).join("\n");

    if (!res.status) {
      return fail(
        exitCode != null
          ? `server exited (code ${exitCode}) before it served :${target}\n${tail}`
          : `server did not answer on http://127.0.0.1:${target}/ within 90s\n${tail}`,
      );
    }
    if (res.status >= 500 || ERR_PAGE_RE.test(res.body)) {
      return fail(`GET / -> ${res.status}, response looks like an error page\n${res.body.slice(0, 400)}`);
    }
    if (SERVER_FATAL_RE.test(logbuf)) {
      const errLines = logbuf
        .split(/\r?\n/)
        .filter((l) => SERVER_FATAL_RE.test(l))
        .slice(0, 10)
        .join("\n");
      return fail(`GET / -> ${res.status} but the server logged a fatal error\n${errLines}`);
    }
    return { name: "boot", passed: true, output: `[boot] GET / -> ${res.status} OK (port ${target})` };
  } finally {
    killTree(child.pid);
  }
}

const ERR_PAGE_RE =
  /Application error|This page could not be found|Internal Server Error|__NEXT_ERROR__|>\s*500\s*<|Server Error \(500\)|Cannot GET \//i;
const SERVER_FATAL_RE =
  /Cannot find module|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|UnhandledPromiseRejection|Unhandled 'error' event|SyntaxError:|ReferenceError:|EADDRINUSE|listen EACCES/m;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function httpGet(port: number, path = "/"): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path, timeout: 4000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        if (body.length < 65_536) body += c;
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: "" });
    });
    req.on("error", () => resolve({ status: 0, body: "" }));
  });
}

async function waitForHttp(port: number, totalMs: number): Promise<{ status: number; body: string }> {
  const deadline = Date.now() + totalMs;
  let last = { status: 0, body: "" };
  while (Date.now() < deadline) {
    last = await httpGet(port);
    if (last.status) return last;
    await sleep(1000);
  }
  return last;
}

function killTree(pid?: number) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* not a group leader */
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

function extractFailures(output: string, tag = ""): string[] {
  const prefix = tag ? `[${tag}] ` : "";
  return [
    ...new Set(
      output
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && FAILURE_RE.test(l))
        .map((l) => prefix + l.replace(/\s+/g, " ").slice(0, 200)),
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
