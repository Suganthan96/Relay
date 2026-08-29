# Relay backend

The trust + orchestration layer from `relay-project-description.md`. Node 22 + TypeScript.

## Build status

| md ref | Layer | Status |
|---|---|---|
| §5 | Supabase schema | ✅ **applied to project `nvbjngzlqizvcbgrrwld`** — 4 tables live + Data-API exposed |
| §5 | Agent rows seeded | ✅ 4 DIDs in `agents` (via `20260828084500_seed_agents.sql`) |
| §4 | Ed25519 keypairs + `did:key` (`src/identity/`) | ✅ working |
| §4 | Canonical payload + sign/verify | ✅ working (`npm run demo:sign`) |
| §4 | Signed `task_attempts` writer (`src/db/attempts.ts`) | ✅ **verified end-to-end** (`npm run db:verify`) against the live DB |
| §3 | Coordinator + pipeline | ⏳ next |
| §3 | Planner / Coder / Tester / Reviewer agents | ⏳ |
| §3 | Reputation gate | ⏳ (SQL `recompute_reputation` done) |
| §3 | GitHub issue ingestion + Octokit PR | ⏳ |
| §5 | Dashboard trust graph | ⏳ (in `../frontend`) |

## Setup

```bash
npm install
cp .env.example .env          # SUPABASE_URL is prefilled; add the keys / Anthropic / GitHub

# 1. link the Supabase CLI to the project (one-time, interactive)
npx supabase login                                   # opens browser / paste token
npx supabase link --project-ref nvbjngzlqizvcbgrrwld # prompts for the DB password

# 2. create the tables
npm run db:migrate            # = supabase db push

# 3. generate the four agent keypairs (private keys stay in ./.keys, git-ignored)
npm run keys:gen

# 4. seed the agents table with their DIDs + public keys
npm run db:push
```

## Scripts

| command | what it does |
|---|---|
| `npm run demo:sign` | offline: sign an attempt, verify ✓, tamper a field, verify ✗ (md §4 demo) |
| `npm run keys:gen` | write `./.keys/agents.json` (add `-- --force` to regenerate) |
| `npm run db:migrate` | `supabase db push` — apply migrations to the linked project |
| `npm run db:push` | upsert the four agent rows from the keypairs |
| `npm run db:verify` | end-to-end: sign an attempt into the live DB, tamper it, confirm the badge flips ✓→✗ |
| `npm run typecheck` | `tsc --noEmit` |

## Layout

```
supabase/
  config.toml              CLI project config
  migrations/
    *_initial_schema.sql   tables: agents, tasks, task_attempts, reputation_scores + recompute_reputation()
src/config.ts              env access
src/identity/
  did.ts                   publicKey <-> did:key:z6Mk... (ed25519-pub multicodec + base58btc)
  canonical.ts             deterministic JSON for the signed payload
  signing.ts               AttestationPayload, signPayload / verifyPayload
  keys.ts                  AgentKey, newAgentKey, loadAgentKeys
  generate.ts              `keys:gen` entrypoint
  demo.ts                  `demo:sign` entrypoint
src/db/
  client.ts                service-role Supabase client
  types.ts                 row types
  agents.ts                loadAgents() — the four agent rows keyed by role
  attempts.ts              recordAttempt() + verifyAttemptRow() (signature + column consistency)
  push.ts                  `db:push` entrypoint
  verify-e2e.ts            `db:verify` entrypoint
```
