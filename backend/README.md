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
| §3 | Coordinator + pipeline (`src/coordinator/pipeline.ts`) | ✅ runs end-to-end (`npm run pipeline`) |
| §3 | Planner / Coder / Tester / Reviewer agents | ✅ all four are real headless `claude -p` runs (no API key) |
| §3 | Tester = baseline diff | ✅ suite is run on the pristine clone first; only a **new** failure (regression) fails the task — pre-existing unrelated failures don't |
| §3 | Reputation gate (`src/coordinator/reputation.ts`) | ✅ per `(agent, task_type)`; escalates on no/low history or sensitive area |
| §3 | Octokit PR (`src/github/pr.ts`) | ✅ fast-approve / flagged PR via a GitHub App installation token; else stops at a signed decision packet |
| §3 | GitHub issue ingestion — App webhook (`src/server.ts`) | ✅ `issues.opened` → `createTask` → detached `runPipeline` |
| §3 | Human decision API (`POST /api/decision`) | ✅ signed `human_override` → squash-merge PR → close/label issue → `apply_human_signal` |
| §5 | Trust score (`relay_trust_score`) | ✅ `(tests_ok + 3·approvals + 1) / (tests_total + 3·(approvals+rejections) + 2)` — human merge weighted 3× |
| §5 | Dashboard (`../frontend`) | ✅ `/dashboard` `/graph` `/tasks` `/approvals` `/agents` — live graph, in-browser verify, tamper, real approve/merge |
| §6·2 | Sandboxed test runs (`src/coordinator/sandbox.ts`) | ✅ `SANDBOX=docker` → `docker run --rm --network none`; `npm run sandbox:build` |
| §6·3 | Per-team trust policy (`relay_policies`, `src/coordinator/policy.ts`) | ✅ per-repo `trust_threshold` / `min_history` / `sensitive_paths` / auto-approve + always-flag task types |
| §6·5 | Slack / webhook escalations (`src/coordinator/notify.ts`) | ✅ `SLACK_WEBHOOK_URL` + `RELAY_NOTIFY_WEBHOOK` (no-op if unset) |
| §6·6 | Multi-org isolation (`org_slug`, `relay_current_org()`) | ✅ every row carries `org_slug`; `supabase/enforce-org.sql` flips on RLS isolation |

## Setup

```bash
npm install
cp .env.example .env          # SUPABASE_URL is prefilled; add the Supabase keys + GitHub App
#                              agents use the machine's Claude Code login — no API key

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

## Running the pipeline

### Automatic — GitHub App webhook (md 3)

```bash
npm run serve        # Express server, POST /webhook, port 8787
```

Set up once:
1. Create a GitHub App — permissions **Issues: read**, **Contents: write**, **Pull requests: write**; subscribe to the **Issues** event.
2. Webhook URL → `https://<public-host>/webhook` (dev: `cloudflared tunnel --url http://localhost:8787`), webhook secret → `GITHUB_WEBHOOK_SECRET`.
3. Download the App's private key `.pem` → `backend/private-key.pem`; App ID → `GITHUB_APP_ID`.
4. Install the App on the target repo(s).

Opening an issue then creates a task and runs Planner → Coder → Tester → Reviewer,
opening a PR (fast-approve or flagged) with an installation token. Set
`RELAY_ISSUE_LABEL` to only act on labelled issues.

### Manual — CLI

```bash
npm run pipeline -- issue "<title>" --body "<details>" --repo owner/name
#   --repo owner/name  -> real clone + real PR (App installation token is resolved
#                         from the repo owner, so the CLI works without a webhook)
#   --repo <local path> -> local clone, stops at a signed decision packet (no PR)
npm run pipeline -- run <taskId>
```

Flow (`src/coordinator/pipeline.ts`): `planning → [reputation gate] → coding → testing → reviewing → pr_opened | escalated`.
A signed `task_attempt` is written after every handoff and chained via `parent_attempt_id`.

## Scripts

| command | what it does |
|---|---|
| `npm run serve` | GitHub App webhook receiver — issue opened → task → pipeline |
| `npm run pipeline -- issue "..." --repo ...` | create a task and run Planner → Coder → Tester → Reviewer |
| `npm run pipeline -- run <taskId>` | re-run the pipeline on an existing task |
| `npm run demo:sign` | offline: sign an attempt, verify ✓, tamper a field, verify ✗ (md §4 demo) |
| `npm run keys:gen` | write `./.keys/agents.json` (add `-- --force` to regenerate) |
| `npm run db:migrate` | `supabase db push` — apply migrations to the linked project |
| `npm run db:push` | upsert the four agent rows from the keypairs |
| `npm run db:verify` | end-to-end: sign an attempt into the live DB, tamper it, confirm the badge flips ✓→✗ |
| `npm run typecheck` | `tsc --noEmit` |

## Layout

```
supabase/migrations/
  *_initial_schema.sql     tables: agents, tasks, task_attempts, reputation_scores
  *_seed_agents.sql        the four agent DIDs
  *_reputation_v3.sql      recompute_reputation(): coder/planner scored by final test outcome
src/server.ts              GitHub App webhook receiver (issues.opened -> pipeline)
src/index.ts               CLI entrypoint (issue / run)
src/config.ts              env access
src/identity/
  did.ts                   publicKey <-> did:key:z6Mk... (ed25519-pub multicodec + base58btc)
  canonical.ts             deterministic JSON for the signed payload
  signing.ts               AttestationPayload, signPayload / verifyPayload
  keys.ts / generate.ts / demo.ts
src/db/
  client.ts                service-role Supabase client
  types.ts                 row types
  agents.ts                loadAgents() — the four agent rows keyed by role
  tasks.ts                 createTask / getTask / patchTask (status state machine)
  attempts.ts              recordAttempt() + verifyAttemptRow() (signature + column consistency)
  push.ts / verify-e2e.ts
src/agents/
  claude.ts                headless `claude -p` runner (stdin prompt, JSON out, retry)
  types.ts                 agent input/result interfaces
  planner.ts               issue -> task_type + declared scope + plan + allowed paths
  coder.ts                 headless edit in the clone, scoped to allowed tools
  tester.ts                headless test run, no writes, PASS/FAIL
  reviewer.ts              diff + tests + reputation -> fast_approve | flagged_review
src/coordinator/
  reputation.ts            getReputation() + evaluateGate() (proceed / escalate)
  workspace.ts             clone (github or local) + branch + diff + test-cmd detect
  pipeline.ts              the orchestration loop
src/github/
  auth.ts                  GitHub App -> installation token (PAT fallback)
  pr.ts                    Octokit PR open (fast-approve vs flagged body)
```
