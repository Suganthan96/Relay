# Relay — A Trust Layer for Autonomous Coding Agents

**Track:** Agentic Web, Swarms & Harnesses (Track 02)
**Team size:** 3–4
**One-liner:** Relay is a reputation-gated agent swarm that prepares GitHub fixes end-to-end — but never merges without a human's final approval, and calibrates how much scrutiny it asks for based on earned trust.

---

## Submission Description (Stateless dashboard / pitch copy)

Autonomous coding agents already open real pull requests today — GitHub Copilot's coding agent, OpenHands, Devin, Cursor. But peer-reviewed research analyzing thousands of real agent-authored PRs found that 46.41% of AI-agent bug fixes get rejected — nearly half of what these systems ship gets discarded after already consuming human review time, CI runs, and validation effort. The problem isn't a lack of autonomy. It's the absence of any mechanism deciding, *before* a PR is opened, whether a given agent has actually earned the standing to act unsupervised on a given kind of change.

Relay is that missing layer. It's a multi-agent harness — Planner, Coder, Tester, and Reviewer — that takes a GitHub issue from creation to a ready-to-merge pull request, with every handoff between agents gated by a live, verifiable reputation score built from real, verified outcomes, scoped per task category rather than one blanket trust number. Each agent carries a cryptographically real identity (a W3C `did:key`), and every attempt it makes is signed and independently verifiable — a growing, tamper-evident trust graph, not a self-reported log.

Critically, Relay never merges anything on its own. A human always makes the final call. What reputation controls is how much friction that call requires: a high-trust agent working within its proven scope produces a fast-approve request — summary, diff, and tests ready, one click to ship. A low-confidence or out-of-scope change produces a fully flagged review, with Relay explaining exactly what it's unsure about, rather than shipping and hoping.

Built for Track 02 — Agentic Web, Swarms & Harnesses.

---

## 1. The Problem

Autonomous coding agents (GitHub Copilot coding agent, OpenHands, AutoFix, AutoPR, Devin, Cursor, Claude-based agents, etc.) already exist and already open pull requests on real repos without a human writing the code. The data on how that's going, from peer-reviewed 2026 research mining real GitHub activity:

- **46.41% of AI-agent bug-fix PRs get rejected.** A study analyzing the AIDev dataset — pull requests from Copilot, Devin, Cursor, and Claude across real repositories — found that out of 3,225 fix PRs, 1,497 were closed without ever being merged. Almost half of what these agents ship gets discarded, after already consuming human review time, CI runs, and validation effort. *(Abujadallah, Arabat & Sayagh, MSR '26 — [arXiv:2606.13468](https://arxiv.org/abs/2606.13468), [Medium write-up](https://medium.com/@mabujadallah/half-of-ai-generated-bug-fixes-get-rejected-we-read-306-of-them-to-find-out-why-59e8ed4eaa41))*
- **A separate large-scale study of ~33,000 agent-authored PRs across five coding agents** found that PRs which don't get merged tend to involve larger, riskier changes — touching more files and frequently failing the project's own CI/CD validation before a human ever weighs in. *(MSR 2026 Mining Challenge — [conference listing](https://2026.msrconf.org/details/msr-2026-mining-challenge/19/Where-Do-AI-Coding-Agents-Fail-An-Empirical-Study-of-Failed-Agentic-Pull-Requests-in))*
- **Rejection reasons are agent-specific and revealing:** Cursor's rejected PRs are nearly half "introduces bugs or breaks APIs" (46.7%); Copilot's top rejection causes are the same category (10.7%) plus "doesn't add value" (8.7%); Devin's rejections are dominated by PRs simply going inactive (31.6%) — i.e. abandoned mid-task with no resolution. *(security-PR rejection study — [arXiv:2604.19965](https://arxiv.org/pdf/2604.19965))*
- **Even a more forgiving re-analysis** — which found that only 35.7% of rejected PRs were genuine agent failures, with the rest attributable to workflow constraints or unclear rationale — still found that 15.4% of *merged* PRs required explicit reviewer intervention to fix problems before landing. *(decision-oriented Agentic-PR study — [arXiv:2605.22534](https://arxiv.org/html/2605.22534))*

**What this data shows in aggregate:** these tools are not failing because they lack autonomy — they clearly have plenty. They're failing because there is no mechanism deciding, *before* a PR is opened, whether this particular agent has earned the standing to act unsupervised on this particular kind of change. Every rejected PR in that 46.41% is a case where the system should have known its own confidence was low and asked first — instead it shipped and let a human discover the failure after the fact.

**That's the actual gap Relay is built to close: not more autonomy, but a trust and confidence gate that sits *before* the PR is opened, not a review that only catches the mistake after.**

---

## 2. The Product

Relay is infrastructure that sits between "an agent can technically do this" and "an agent is trusted to do this unsupervised." It is not another coding assistant — it's the trust and coordination layer that a swarm of coding agents runs through.

### How it works, end to end (hackathon demo scope)

1. A new issue is filed on a GitHub repo.
2. Relay picks it up (via webhook or polling) and creates a task record.
3. A **Planner** agent reads the issue and proposes a plan: what needs to change, and — critically — a **declared scope** ("I will change X, I will not touch Y").
4. A **Coder** agent takes the accepted plan and writes the actual code change — run via the **Claude Code SDK in headless mode** (`claude -p`), which gives it real, tool-scoped file read/write access to a working clone of the repo, constrained by `--allowedTools` to exactly what the declared scope permits.
5. A **Tester** agent runs the project's real test suite against the change — also via headless Claude Code, scoped to `Bash(npm test:*)`-style permissions only (no file-write access), and reports pass/fail.
6. A **Reviewer** agent evaluates the diff against the declared scope, the test results, and the Coder's live reputation score for this category of task. **A human always makes the final merge decision — Relay never merges on its own.** What reputation controls is how much scrutiny the request asks for:
   - **High confidence, in scope, tests pass** → Relay opens the PR as a **fast-approve request**: a clean summary, the diff, and test results, with a one-click "Approve & Merge" — the human's job is confirmation, not investigation.
   - **Low confidence, out-of-scope drift, or a sensitive area (e.g. auth) with no track record** → Relay opens a **flagged review request** with a fuller decision packet (why it's uncertain, what it tried, what it's unsure about) and does not suggest a quick approve — it explicitly asks for real review before merge, then resumes from that exact state once the human responds.
7. Every one of these steps is logged as a **signed, verifiable attempt** tied to that agent's cryptographic identity, and rendered live as a growing trust graph.

### What makes this different from existing tools

**Existing tools referenced, with sources:**
- **GitHub Copilot coding agent** — official, shipped product. [GitHub Blog announcement](https://github.blog/ai-and-ml/github-copilot/assigning-and-completing-issues-with-coding-agent-in-github-copilot/) · [official docs](https://docs.github.com/copilot/concepts/coding-agent/about-copilot-coding-agent)
- **OpenHands GitHub Resolver** — open-source, runs as a GitHub Action. [OpenHands blog post](https://www.openhands.dev/blog/open-source-coding-agents-in-your-github-fixing-your-issues)
- **AutoFix** — 11-agent open-source issue fixer (LangGraph). [GitHub repo](https://github.com/ggbadbi/AutoFix-AI-Multi-Agent-Orchestration-System)
- **AutoPR** — label-triggered autonomous PR writer. [GitHub repo](https://github.com/dmarx/autopr)
- **issue-agent** — scoped to routine/simple fixes. [GitHub repo](https://github.com/clover0/issue-agent)

**Feature-by-feature comparison:**

| | Copilot coding agent | OpenHands / AutoFix / AutoPR | Relay |
|---|---|---|---|
| Opens PRs autonomously | Yes | Yes | Yes |
| Merges without human approval | No (requires review) | Varies — often just opens PR | Never, by design |
| Review effort calibrated to trust | No — every PR reviewed the same way | No | Yes — fast-approve vs. flagged review |
| Scoped, negotiated commitment before acting | No — starts working directly from the issue | No | Yes — Planner declares scope, enforced via Claude Code SDK tool permissions |
| Reputation built from verified outcomes, per task category | No | No | Yes |
| Portable, cryptographically verifiable agent identity | No | No | Yes (DID + Ed25519 signatures) |
| Multi-agent handoff with per-step accountability | Partial (AutoFix has multiple agents, no reputation/identity layer) | Varies | Core mechanism |
| Fixed pipeline vs. adaptive trust gating | Fixed — same process regardless of track record | Fixed | Adaptive — behavior changes based on earned trust |

**The one-sentence differentiator:** these tools all answer "can an agent make this change" — Relay answers "has this agent earned the standing to make this kind of change, and how should a human's review be calibrated accordingly."

---

## 3. Architecture

```
GitHub Issue Created
        │
        ▼
 Webhook / Poller  →  creates `task` record in Supabase
        │
        ▼
┌───────────────────────────────────────────┐
│              Coordinator                  │
│  (your own orchestration code — not an    │
│   LLM call itself; it supervises the four) │
└───────────────────────────────────────────┘
        │
        ▼
   PLANNER (Claude API call #1)
   → proposes plan + declares scope
        │  [signed task_attempt written to Supabase]
        ▼
   Coordinator checks Planner's reputation for this task_type
   → proceed / escalate
        │
        ▼
   CODER (Claude Code SDK, headless mode — `claude -p`,
   scoped via --allowedTools to the declared scope, real
   file read/write in a working clone of the repo)
   → writes the actual diff
        │  [signed task_attempt written to Supabase]
        ▼
   TESTER (Claude Code SDK, headless mode, scoped to
   Bash(npm test:*) only — no file-write access)
   → runs the real test suite, reports pass/fail
        │  [signed task_attempt written to Supabase]
        ▼
   REVIEWER (Claude API call #4)
   → checks diff vs. declared scope, test results,
     and Coder's live reputation score
        │  [signed task_attempt written to Supabase]
        │
        │   A human ALWAYS makes the final merge call — Relay never merges itself.
        │   Reputation decides how much scrutiny the request asks for:
        │
        ├── Confident + in scope + tests pass ──► Opens PR via GitHub API (Octokit)
        │                                          as a FAST-APPROVE request
        │                                          (summary + diff + tests, one-click approve)
        │
        └── Low confidence / out of scope ──► Opens PR as a FLAGGED REVIEW request
                                                (full decision packet: what's uncertain, what
                                                 was tried) via Slack / GitHub comment / dashboard
                                                → resumes from exact state on human decision
        │
        ▼
Human approves & merges (both paths — no autonomous merge)
        │
        ▼
Live trust graph (React Flow, subscribed to Supabase Realtime)
updates as each task_attempt is inserted
```

### Why two different Claude tools, by role

- **Planner and Reviewer** — plain Claude API calls (`@anthropic-ai/sdk`). Pure reasoning/decision agents, no repo access needed.
- **Coder and Tester** — **Claude Code SDK in headless mode** instead of hand-built file-access tools. This avoids building custom sandboxed file-read/write/bash plumbing from scratch — Claude Code already does that safely, with permission scoping (`--allowedTools`) built in. Scoping tool permissions per role also doubles as enforcement of the negotiated scope: the Coder literally cannot touch files outside what was declared, not just asked nicely not to. Each headless run can output structured JSON (`--output-format json`), which plugs directly into the `task_attempts` write.
- **Deployment caveat:** headless Claude Code runs as a CLI process and needs Node.js — Next.js API routes on Vercel would need to shell out to it, which can hit serverless execution/size limits. Plan for the Coder/Tester steps to run on a small dedicated server or container rather than a Vercel serverless function; the Planner/Reviewer/dashboard pieces are fine on Vercel as-is.
- Also worth evaluating: `anthropics/claude-code-action`, an official GitHub Action wrapping headless Claude Code for GitHub workflows (handles branch/commit/PR plumbing) — could replace some of the custom Octokit code, depending on how well it fits the multi-agent structure.

---

## 4. Agent Identity & Trust: DID + Signed Attestations

Each of the four agent roles gets a **real Ed25519 keypair** at startup, generated with `@noble/ed25519` (small, pure-JS, no native build dependencies — safe for a hackathon sprint).

- The public key is base58-encoded with the Ed25519 multicodec prefix and wrapped as `did:key:z6Mk...` — a real, W3C-specified Decentralized Identifier. It requires no blockchain, no registry, no server: the identity is self-certifying, derived directly from the key itself.
- The private key stays server-side and is used to **sign every task attempt** the agent makes.
- What gets signed is a canonical minimal payload:
  ```json
  {
    "agent_did": "did:key:z6Mk...",
    "task_id": "uuid",
    "task_type": "css-fix",
    "scope_declared": "fix mobile login button CSS",
    "outcome": "passed",
    "timestamp": "2026-08-27T10:15:00Z"
  }
  ```
- Anyone — your app, a judge, another company's system — can independently verify the signature against the DID with no lookup required, proving the attempt is genuinely attributable to that agent and untampered.
- **Demo moment:** a "tamper with this record" button that edits an outcome directly in the database, then shows the verification badge flip from ✓ to ✗ live — proves the whole trust story in ~10 seconds without explaining DIDs verbally.

Be precise in the pitch: this is genuine, portable, standards-based cryptographic identity — but it is **not on-chain**. Frame it honestly as chain-agnostic infrastructure that a system like ERC-8004 could consume, not as "we built on blockchain."

---

## 5. Data Layer: Supabase

**Why Supabase:** hosted Postgres + instant REST API + built-in Realtime subscriptions, which gives you live-updating graph nodes with almost no extra code — the fastest path to a working demo given your stack (React/Next.js/TS) and sprint timeline.

### Schema

**`agents`**
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| name | text | "Planner", "Coder", "Tester", "Reviewer" |
| role | text | planner / coder / tester / reviewer |
| did | text | `did:key:z6Mk...` |
| public_key | text | for verification |
| created_at | timestamptz | |

**`tasks`**
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| issue_number | int | |
| issue_title | text | |
| task_type | text | `css-fix`, `logic-fix`, `test-add`, `auth`, etc. — the clustering key |
| org_id | uuid | for multi-company isolation in the production version |
| created_at | timestamptz | |

**`task_attempts`** (the graph's node table)
| field | type | notes |
|---|---|---|
| id | uuid (pk) | |
| task_id | uuid (fk) | |
| agent_id | uuid (fk) | |
| parent_attempt_id | uuid, nullable (fk) | previous handoff — this is the edge |
| scope_declared | text | negotiation step |
| scope_adhered | boolean | |
| outcome | text | `passed`, `failed`, `escalated`, `human_override` |
| confidence_score | float | |
| signature | text | Ed25519 signature over the canonical payload |
| verified_by | text, nullable | tests / reviewer / human |
| timestamp | timestamptz | |

**`reputation_scores`** (derived/cached)
| field | type | notes |
|---|---|---|
| agent_id | uuid (fk) | |
| task_type | text | reputation is scoped per category, not one global number |
| success_count | int | |
| total_count | int | |
| score | float | |
| updated_at | timestamptz | |

### Graph rendering
- **Node** = one `task_attempts` row (color-coded by outcome; size/opacity driven by live `reputation_scores`)
- **Edge** = `parent_attempt_id → id` (the literal handoff chain)
- **Library:** React Flow (best fit for your React/Next.js stack), subscribed to Supabase Realtime so nodes appear on screen the instant a row is inserted — this is the "walk away and watch it work" demo moment.

---

## 6. How a Company Would Actually Use This (production vision — state this in the pitch, don't fully build it in the sprint)

1. **Install as a GitHub App**, not a personal token script — the company grants scoped permissions (issues: read, contents: write, PRs: write) across their org, not a hardcoded single-repo script.
2. **Sandboxed execution** — every Coder/Tester run happens in an isolated, ephemeral container (GitHub Actions itself, or a service like E2B/Modal) with no persistent state or excess network access. This is the non-negotiable requirement for any real company to trust it with production code.
3. **Configurable trust policy per team** — e.g. "auto-merge only above 90% reputation on CSS/copy fixes; anything touching `/auth` or `/payments` always escalates regardless of score." Relay computes the reputation number; the company's policy layer decides what to do with it.
4. **A real dashboard** — pending escalations queue, approve/reject actions, shipped-vs-flagged history, per-role settings. This is the daily-use surface for an engineering manager, beyond the hackathon's demo graph.
5. **Escalations reach humans where they work** — Slack, email, or a GitHub PR comment mentioning a reviewer, not a UI someone has to remember to check.
6. **Multi-org data isolation** — Supabase Row Level Security scoped by `org_id`, so each company's tasks and reputation data stay fully separated.

---

## 7. Judging Rubric Alignment

| Weight | Criterion | How Relay answers it |
|---|---|---|
| 30% | Real-world usefulness | Solves a documented, real problem (agent trust) that existing shipped tools (GitHub Copilot agent, OpenHands) explicitly lack |
| 25% | Execution | One complete, demoable slice: webhook → 4-agent pipeline → reputation-calibrated, human-approved PR → live graph |
| 20% | New Internet leverage | Multi-agent orchestration, A2A handoffs, agent identity (DID), reputation, negotiation — nearly every bullet in the track brief |
| 15% | Technical depth | Real cryptographic signing/verification, a reputation scoring system, structured negotiation enforced at the tool-permission level via Claude Code SDK — not a prompt wrapper |
| 10% | Originality | A visible, live, per-category trust graph with tamper-evident verification — not another "agent chains talk to each other" demo |

---

## 8. Team Split (4 people, weighted)

**Core duo (carries most of the build):**
1. **Pipeline + Coordinator + Reputation Logic** — orchestration loop (webhook → Planner → Coder → Tester → Reviewer), reputation calculation (test exit code + human merge decision only, never Reviewer self-grading), sample-size threshold before fast-approve unlocks, hard never-fast-approve list (auth/security/payments), Claude API + Claude Code SDK integration
2. **Data Layer + Frontend Dashboard** — Supabase schema + Realtime, React Flow live trust graph + activity log, approve/reject UI, DID/signing implementation (`@noble/ed25519`)

**Supporting pair (contained, smaller scope):**
3. **GitHub Integration** — Octokit branch/commit/PR creation, webhook config, fast-approve vs. flagged PR templates
4. **Demo Data, Pitch, Fallback** — runs the pre-seeded real task batch to build genuine reputation history, records backup demo video, builds pitch deck/README, QA-breaks the live path before judges do

---

## 9. Build Checklist

### Setup
- [ ] Create GitHub repo, choose OSS license (MIT/Apache-2.0/GPL — required for submission)
- [ ] Set up Supabase project
- [ ] Set up Vercel project (frontend + Planner/Reviewer API routes)
- [ ] Provision a small server/container for Coder/Tester (Claude Code SDK needs Node.js CLI execution — won't run cleanly on Vercel serverless)
- [ ] Pick and prep a demo repo (a real small OSS-style repo with a real test suite) to run issues against

### Data Layer (Person 2)
- [ ] Create `agents`, `tasks`, `task_attempts`, `reputation_scores` tables in Supabase
- [ ] Enable Realtime on `task_attempts`
- [ ] Generate Ed25519 keypair per agent (`@noble/ed25519`), derive `did:key`, store public key
- [ ] Build sign function (canonical payload → signature) and verify function
- [ ] Build reputation recompute logic hook (or on-read calculation)

### Pipeline (Person 1)
- [ ] Webhook or poller that creates a `task` row on new GitHub issue
- [ ] Planner: Claude API call, outputs plan + declared scope + task_type (coarse buckets: css/logic/test/auth-security/config/other)
- [ ] Coder: Claude Code SDK headless call, `--allowedTools` scoped to declared scope, working repo clone
- [ ] Tester: Claude Code SDK headless call scoped to `Bash(test:*)` only, capture **raw exit code** (not LLM-summarized result)
- [ ] Reviewer: Claude API call, decides fast-approve vs. flagged **based on reputation + scope adherence + test result** — does NOT set reputation itself
- [ ] Reputation update logic: triggered by (a) test exit code, (b) human's actual merge action (merged-as-is / edited / rejected) — never by Reviewer's verdict
- [ ] Sample-size gate: fast-approve only available once ≥10 attempts logged for that agent+task_type
- [ ] Hard exclusion: auth/security/payments task_types always flagged, never fast-approve
- [ ] Every step writes a signed `task_attempts` row

### GitHub Integration (Person 3)
- [ ] Octokit: create branch, push commits, open PR
- [ ] Fast-approve PR template (summary, diff, tests, one-click approve framing)
- [ ] Flagged review PR template (full decision packet: uncertainty, what was tried)
- [ ] Human decision capture: detect merge / edit-then-merge / close-without-merge, feed back into reputation update

### Frontend (Person 2)
- [ ] Dashboard shell (Next.js + Tailwind)
- [ ] React Flow graph: nodes = `task_attempts`, edges = `parent_attempt_id`, color by outcome
- [ ] Live activity log panel (scrolling feed of what just happened)
- [ ] Agent identity page: DID, reputation per task_type, "verify signature" button
- [ ] "Tamper with this record" demo button + verification badge flip
- [ ] Approve/reject view for pending PRs

### Demo Prep (Person 4)
- [ ] Run ~15-20 real tasks through the full pipeline before demo day to build genuine (not fabricated) reputation history
- [ ] Record a full successful end-to-end run as backup video
- [ ] Write the demo script (what to click, in what order, what to say)
- [ ] Build pitch deck from this doc's Problem/Product/Architecture/Rubric sections
- [ ] Rehearse the "who verifies the verifier" Q&A answer out loud
- [ ] Try to break the live demo (bad network, slow test run, ambiguous issue) before judges do

### Submission
- [ ] Public GitHub repo, properly licensed
- [ ] 3-4 minute demo + pitch video recorded
- [ ] Project submitted on Stateless dashboard: name, description (use the Submission Description section above), team, images
- [ ] README explaining what's built vs. what's "future work" (production sandboxing, GitHub App install, policy layer)