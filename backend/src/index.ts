import "dotenv/config";
import { config } from "./config.js";
import { createTask } from "./db/tasks.js";
import { runPipeline } from "./coordinator/pipeline.js";

/**
 * Relay CLI entrypoint.
 *
 *   npm start -- run <taskId>
 *   npm start -- issue "<title>" [--body "..."] [--repo owner/name] [--number 123]
 *
 * `issue` creates a task record then runs the full pipeline on it (md 3).
 */
function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const [cmd, positional] = process.argv.slice(2);

if (cmd === "run") {
  if (!positional) throw new Error("usage: npm start -- run <taskId>");
  const res = await runPipeline(positional);
  console.log(JSON.stringify(res, null, 2));
} else if (cmd === "issue") {
  if (!positional) throw new Error('usage: npm start -- issue "<title>" [--body ...] [--repo ...]');
  const repo = arg("--repo") ?? config.optionalGithubRepo();
  if (!repo) throw new Error("no --repo and GITHUB_REPO is unset");
  const task = await createTask({
    issueTitle: positional,
    issueBody: arg("--body"),
    repo,
    issueNumber: arg("--number") ? Number(arg("--number")) : undefined,
  });
  console.log(`created task ${task.id} for ${repo}`);
  const res = await runPipeline(task.id);
  console.log(JSON.stringify(res, null, 2));
} else {
  console.log(
    [
      "Relay coordinator",
      "",
      "  npm start -- run <taskId>",
      '  npm start -- issue "<title>" [--body "..."] [--repo owner/name] [--number 123]',
    ].join("\n"),
  );
  process.exit(cmd ? 1 : 0);
}
