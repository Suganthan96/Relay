import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";

const exec = promisify(execFile);

/**
 * Sandboxed execution for the parts that run *arbitrary code from a cloned repo*
 * — `npm install`, `npm test`, postinstall hooks (md 6·2).
 *
 *   SANDBOX=local   run on this host (fine for a repo you trust / a demo)
 *   SANDBOX=docker  run in `docker run --rm --network none`, repo bind-mounted,
 *                   no network, no persistence — destroyed on exit
 *
 * The Coder/Tester `claude -p` calls stay on the host: Claude Code has its own
 * permission model and tool scoping; the danger is the repo's own scripts.
 */
export interface SandboxRun {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface SandboxOpts {
  /** working dir (the repo clone) — bind-mounted to /work in docker mode */
  dir: string;
  /** shell command line, e.g. "npm test" */
  command: string;
  /** allow outbound network (docker mode). default false. */
  network?: boolean;
  timeoutMs?: number;
}

export async function sandboxAvailable(): Promise<boolean> {
  if (config.sandbox() !== "docker") return true; // local always available
  try {
    await exec("docker", ["info", "--format", "{{.ServerVersion}}"], { timeout: 8000 });
    return true;
  } catch {
    return false;
  }
}

export async function runInSandbox(opts: SandboxOpts): Promise<SandboxRun> {
  const timeout = opts.timeoutMs ?? 300_000;
  if (config.sandbox() === "docker" && (await sandboxAvailable())) {
    const args = [
      "run", "--rm",
      "--network", opts.network ? "bridge" : "none",
      "--cpus", "2", "--memory", "2g",
      "--pids-limit", "512",
      "-v", `${opts.dir}:/work`,
      "-w", "/work",
      config.sandboxImage(),
      "sh", "-lc", opts.command,
    ];
    return capture("docker", args, timeout);
  }
  // local
  const shell = process.platform === "win32" ? "cmd" : "sh";
  const shellArgs = process.platform === "win32" ? ["/c", opts.command] : ["-lc", opts.command];
  return capture(shell, shellArgs, timeout, opts.dir);
}

async function capture(bin: string, args: string[], timeout: number, cwd?: string): Promise<SandboxRun> {
  try {
    const { stdout, stderr } = await exec(bin, args, { cwd, timeout, maxBuffer: 20 * 1024 * 1024 });
    return { code: 0, stdout: String(stdout), stderr: String(stderr) };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      code: typeof err.code === "number" ? err.code : null,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? "") + (err.stdout ? "" : `\n${err.message ?? ""}`),
    };
  }
}
