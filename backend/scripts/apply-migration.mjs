// Apply a migration file to the linked Supabase project via the Management API
// (bypasses the Postgres pooler). Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs <version>_<name>.sql
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || "nvbjngzlqizvcbgrrwld";
const file = process.argv[2];
if (!token || !file) {
  console.error("usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs <file.sql>");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const m = basename(file).match(/^(\d+)_(.+)\.sql$/);
const version = m?.[1];
const name = m?.[2] ?? "manual";

async function run(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${body}`);
  return body;
}

console.log(`applying ${name} (${version})…`);
await run(sql);
if (version) {
  await run(
    `insert into supabase_migrations.schema_migrations (version, name)
     values ('${version}', '${name}') on conflict (version) do nothing;`,
  );
  console.log("registered in schema_migrations");
}
console.log("done");
