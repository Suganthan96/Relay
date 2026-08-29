import { spawn } from "node:child_process";
import { config } from "../config.js";

/**
 * Thin wrapper around headless Claude Code (`claude -p`). All four Relay agents
 * run through this — no ANTHROPIC_API_KEY, it uses the machine's existing
 * Claude Code login (md 3: "Claude Code SDK in headless mode").
 */
export interface RunOptions {
  prompt: string;
  /** working directory for the run (the repo clone, for Coder/Tester) */
  cwd?: string;
  /** whitelist, e.g. ['Edit', 'Write', 'Bash(npm test:*)'] — omit for a tool-less reasoning run */
  allowedTools?: string[];
  disallowedTools?: string[];
  /** 'acceptEdits' for the Coder, left default (ask, but nothing to ask in -p) otherwise */
  permissionMode?: "acceptEdits" | "bypassPermissions" | "dontAsk" | "plan";
  /** when set, the model must return JSON matching this schema (Planner/Reviewer) */
  jsonSchema?: Record<string, unknown>;
  maxTurns?: number;
  timeoutMs?: number;
  systemPromptAppend?: string;
  /** re-run this many extra times if the run ends in error_max_turns / execution error */
  retries?: number;
}

export interface RunResult {
  /** the model's final text, or the JSON string when jsonSchema was used */
  text: string;
  /** parsed object when jsonSchema was used and the model produced valid output */
  structuredOutput?: unknown;
  isError: boolean;
  /** 'success' | 'error_max_turns' | 'error_during_execution' | ... */
  subtype: string;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  sessionId: string;
}

function resolveBin(): string {
  const bin = config.claudeCliPath();
  if (process.platform === "win32" && !/\.(exe|cmd|bat)$/i.test(bin)) return `${bin}.exe`;
  return bin;
}

export async function runClaude(opts: RunOptions): Promise<RunResult> {
  const retries = opts.retries ?? 0;
  let last: RunResult | undefined;
  for (let i = 0; i <= retries; i++) {
    last = await runClaudeOnce(opts);
    if (!last.isError || last.structuredOutput) return last;
    if (last.subtype !== "error_max_turns" && last.subtype !== "error_during_execution") return last;
  }
  return last!;
}

async function runClaudeOnce(opts: RunOptions): Promise<RunResult> {
  // Prompt goes on stdin, not argv — keeps large/quoted prompts off the command line.
  const args = ["-p", "--output-format", "json", "--no-session-persistence"];

  if (opts.allowedTools?.length) args.push("--allowedTools", opts.allowedTools.join(" "));
  if (opts.disallowedTools?.length) args.push("--disallowedTools", opts.disallowedTools.join(" "));
  if (opts.permissionMode) args.push("--permission-mode", opts.permissionMode);
  if (opts.jsonSchema) args.push("--json-schema", JSON.stringify(opts.jsonSchema));
  if (opts.maxTurns) args.push("--max-turns", String(opts.maxTurns));
  if (opts.systemPromptAppend) args.push("--append-system-prompt", opts.systemPromptAppend);
  if (opts.cwd) args.push("--add-dir", opts.cwd);

  const bin = resolveBin();
  const timeoutMs = opts.timeoutMs ?? 180_000;

  return await new Promise<RunResult>((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd ?? process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude run timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdin.write(opts.prompt);
    child.stdin.end();

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`failed to spawn "${bin}": ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let parsed: any;
      try {
        parsed = JSON.parse(stdout.trim());
      } catch {
        return reject(
          new Error(
            `claude run exited ${code} with unparseable output.\n` +
              `stdout: ${stdout.slice(0, 500)}\nstderr: ${stderr.slice(0, 500)}`,
          ),
        );
      }
      const text =
        typeof parsed.result === "string"
          ? parsed.result
          : parsed.result != null
            ? JSON.stringify(parsed.result)
            : "";
      resolve({
        text,
        structuredOutput: parsed.structured_output ?? undefined,
        isError: Boolean(parsed.is_error) || parsed.subtype !== "success" || code !== 0,
        subtype: String(parsed.subtype ?? (code === 0 ? "success" : "error")),
        costUsd: Number(parsed.total_cost_usd ?? 0),
        durationMs: Number(parsed.duration_ms ?? 0),
        numTurns: Number(parsed.num_turns ?? 0),
        sessionId: String(parsed.session_id ?? ""),
      });
    });
  });
}

/** Parse a JSON object out of model text — handles bare JSON or a ```json fence. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first !== -1 && last > first) {
      return JSON.parse(candidate.slice(first, last + 1)) as T;
    }
    throw new Error(`no JSON object in model output: ${text.slice(0, 300)}`);
  }
}
