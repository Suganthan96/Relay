import "dotenv/config";
import { db } from "./client.js";
import { loadAgents } from "./agents.js";
import { recordAttempt, verifyAttemptRow } from "./attempts.js";
import { loadAgentKeys } from "../identity/keys.js";
import { config } from "../config.js";

/**
 * End-to-end proof against the real database (md 4):
 *   1. create a throwaway task
 *   2. write a SIGNED plan attempt through recordAttempt()
 *   3. read it back, verify                          -> expect ✓
 *   4. tamper the row in the DB (flip `outcome`), verify -> expect ✗
 *   5. delete the task (cascades to the attempt)
 *
 *   npm run db:verify
 */
const SELECT = "payload, signature, outcome, scope_declared";

const keys = await loadAgentKeys(config.agentKeysPath());
const agents = await loadAgents();

// 1. throwaway task
const { data: task, error: taskErr } = await db()
  .from("tasks")
  .insert({ issue_title: "[e2e] verify signed attempts", task_type: "css-fix", status: "planning" })
  .select()
  .single();
if (taskErr) throw new Error(`create task failed: ${taskErr.message}`);
console.log(`task        ${task.id}`);

// 2. signed plan attempt
const attempt = await recordAttempt({
  task,
  step: "plan",
  agentKey: keys.planner,
  agentId: agents.planner.id,
  parentAttemptId: null,
  scopeDeclared: "fix mobile login button CSS; do not touch auth",
  scopeAdhered: true,
  outcome: "passed",
  confidence: 0.9,
  detail: { note: "e2e" },
});
console.log(`attempt     ${attempt.id}  sig ${attempt.signature.slice(0, 16)}...`);

// 3. read back + verify
const { data: fresh, error: readErr } = await db()
  .from("task_attempts")
  .select(SELECT)
  .eq("id", attempt.id)
  .single();
if (readErr) throw new Error(`read back failed: ${readErr.message}`);
const before = verifyAttemptRow(fresh as any);
console.log(
  `verify      ok=${before.ok}  sig=${before.signatureValid}  consistent=${before.consistent}  (expected all true)`,
);

// 4. tamper in the DB, re-verify
await db().from("task_attempts").update({ outcome: "failed" }).eq("id", attempt.id);
const { data: tampered } = await db()
  .from("task_attempts")
  .select(SELECT)
  .eq("id", attempt.id)
  .single();
const after = verifyAttemptRow(tampered as any);
console.log(
  `tamper      ok=${after.ok}  sig=${after.signatureValid}  consistent=${after.consistent}  (expected ok=false)`,
);
if (after.mismatch.length) console.log(`            mismatch -> ${after.mismatch.join("; ")}`);

// 5. cleanup
await db().from("tasks").delete().eq("id", task.id);
console.log(`cleanup     task + attempt deleted`);

const pass = before.ok && !after.ok && after.signatureValid && !after.consistent;
console.log(`\n${pass ? "E2E OK ✓" : "E2E FAILED ✗"}`);
process.exit(pass ? 0 : 1);
