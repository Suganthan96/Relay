import "dotenv/config";
import { db } from "./client.js";
import { loadAgentKeys, AGENT_ROLES } from "../identity/keys.js";
import { config } from "../config.js";

/**
 * Seed the agents table from the local keypairs (md 4, 5).
 *
 * Prereq: apply the schema first with `npm run db:migrate` (supabase db push).
 * This script is idempotent: it upserts the four agent rows on their unique
 * `role`.
 *
 *   npm run db:push
 */
const keys = await loadAgentKeys(config.agentKeysPath());

const rows = AGENT_ROLES.map((role) => {
  const k = keys[role];
  return { name: k.name, role: k.role, did: k.did, public_key: k.publicKeyMultibase };
});

const { data, error } = await db()
  .from("agents")
  .upsert(rows, { onConflict: "role" })
  .select("id, role, did");

if (error) {
  console.error("seed failed:", error.message);
  console.error("did you apply the schema first? -> npm run db:migrate");
  process.exit(1);
}

console.log(`seeded ${data.length} agents:`);
for (const a of data) console.log(`  ${a.role.padEnd(9)} ${a.did}  (${a.id})`);
