import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname } from "node:path";
import "dotenv/config";
import { AGENT_ROLES, newAgentKey, serializeKeys } from "./keys.js";

/**
 * Generate the four agent Ed25519 keypairs once and persist them (md section 4).
 * Private keys stay on this file, git-ignored; only DID + public key go to the DB.
 *
 *   npm run keys:gen            # refuses to overwrite
 *   npm run keys:gen -- --force # regenerate (invalidates every prior signature)
 */
const path = process.env.AGENT_KEYS_PATH || "./.keys/agents.json";
const force = process.argv.includes("--force");

const exists = await access(path).then(
  () => true,
  () => false,
);
if (exists && !force) {
  console.error(`refusing to overwrite ${path} — pass --force to regenerate`);
  process.exit(1);
}

const keys = AGENT_ROLES.map(newAgentKey);
await mkdir(dirname(path), { recursive: true });
await writeFile(path, serializeKeys(keys), { mode: 0o600 });

console.log(`wrote ${keys.length} agent keypairs -> ${path}\n`);
for (const k of keys) {
  console.log(`  ${k.name.padEnd(9)} ${k.did}`);
}
console.log(`\nNext: \`npm run db:push\` seeds these DIDs into the agents table.`);
