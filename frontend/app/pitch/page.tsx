"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./pitch.module.css";

const COUNT = 5;
const pad = (n: number) => String(n).padStart(2, "0");

type Tone = "yes" | "no" | "mid" | "lock";
const MARK: Record<Tone, string> = { yes: "✅", no: "❌", mid: "➖", lock: "🔒" };

/** [tone, optional short note] */
type Cell = [Tone] | [Tone, string];

const CMP_ROWS: { cap: string; cells: [Cell, Cell, Cell, Cell] }[] = [
  { cap: "Writes the fix", cells: [["yes"], ["yes"], ["no", "review only"], ["yes", "4-agent swarm"]] },
  {
    cap: "Reviews the diff",
    cells: [["mid", "basic"], ["no"], ["yes", "deep, line-by-line"], ["yes", "Reviewer + decision packet"]],
  },
  {
    cap: "Acts before the PR exists",
    cells: [["no", "after"], ["no", "after"], ["no", "post-hoc"], ["yes", "the gate decides if it acts"]],
  },
  {
    cap: "Merges without a human",
    cells: [["no"], ["mid", "often just opens"], ["mid", "n/a"], ["lock", "never — by design"]],
  },
  { cap: "Reputation from verified outcomes, per category", cells: [["no"], ["no"], ["no"], ["yes"]] },
  {
    cap: "Review effort scaled to earned trust",
    cells: [["no", "every PR the same"], ["no"], ["no", "same depth every PR"], ["yes", "fast-approve vs flagged"]],
  },
  {
    cap: "Scope committed & enforced before coding",
    cells: [["no", "starts from the issue"], ["no"], ["mid", "n/a"], ["yes", "Planner declares · Coder tool-locked"]],
  },
  { cap: "Portable signed agent identity (DID)", cells: [["no"], ["no"], ["no"], ["yes", "did:key + Ed25519"]] },
];

export default function PitchPage() {
  const [index, setIndex] = useState(0);

  const go = useCallback((n: number) => {
    setIndex((cur) => Math.max(0, Math.min(COUNT - 1, typeof n === "number" ? n : cur)));
  }, []);
  const next = useCallback(() => setIndex((i) => Math.min(COUNT - 1, i + 1)), []);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        prev();
      } else if (e.key === "Home") {
        e.preventDefault();
        setIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setIndex(COUNT - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  const slideClass = (i: number) => `${styles.slide} ${i === index ? styles.active : ""}`;

  return (
    <div className={styles.deck}>
      <div className={styles.progress}>
        <i style={{ width: `${((index + 1) / COUNT) * 100}%` }} />
      </div>

      <Link href="/" className={styles.close} aria-label="Exit presentation">
        ✕
      </Link>

      <button className={`${styles.edge} ${styles.edgeL}`} onClick={prev} aria-label="Previous slide" tabIndex={-1} />
      <button className={`${styles.edge} ${styles.edgeR}`} onClick={next} aria-label="Next slide" tabIndex={-1} />

      <div className={styles.track} style={{ transform: `translateX(-${index * 100}vw)` }}>
        {/* ---------- 1 · title ---------- */}
        <section className={`${slideClass(0)} ${styles.title}`}>
          <div className={styles.glow} aria-hidden="true" />
          <div className={styles.wrap}>
            <h1 className={styles.brand}>Relay</h1>
            <p className={styles.sig}>
              did:key:z6MkfkQRVXnusDwFbtiuaLGidHGanHY6PZsSDWiYpQbHZxbV&nbsp;&nbsp;·&nbsp;&nbsp;<b>✓ verified</b>
            </p>
            <p className={styles.thesis}>
              A trust layer for autonomous coding agents — it prepares the fix, but a human always makes the{" "}
              <em>final call</em>.
            </p>
            <div className={styles.chips}>
              <span>Planner</span>
              <span>Coder</span>
              <span>Tester</span>
              <span>Reviewer</span>
            </div>
            <div className={styles.ctaRow}>
              <button type="button" className={styles.btnCosmoq} onClick={() => go(3)}>
                See how it works
              </button>
              <Link href="/dashboard" className={styles.btnGhost}>
                Open the live dashboard
              </Link>
            </div>
            <p className={styles.track2}>Track 02 — Agentic Web, Swarms &amp; Harnesses</p>
          </div>
        </section>

        {/* ---------- 2 · problem ---------- */}
        <section className={slideClass(1)}>
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>
              02 <span>—</span> The problem
            </p>
            <h2 className={styles.slideH}>
              Autonomous coding agents already ship code. Nearly half of it is thrown away.
            </h2>
            <div className={styles.layers}>
              <div className={styles.layer}>
                <div className={styles.stat}>
                  46.4%
                  <span className={styles.statSub}>fix PRs rejected</span>
                </div>
                <div className={styles.layerBody}>
                  <p>
                    <span className={styles.layerN}>L1</span>Of AI-agent bug-fix PRs, <strong>1,497 of 3,225 were
                    closed without ever merging</strong> — across Copilot, Devin, Cursor and Claude-based agents. Each
                    one had already burned human review time, CI minutes and context.
                  </p>
                  <cite className={styles.cite}>Abujadallah, Arabat &amp; Sayagh — MSR&nbsp;’26 · arXiv:2606.13468</cite>
                </div>
              </div>

              <div className={styles.layer}>
                <div className={styles.stat}>
                  46.7%
                  <span className={styles.statSub}>“introduces bugs”</span>
                </div>
                <div className={styles.layerBody}>
                  <p>
                    <span className={styles.layerN}>L2</span>The rejections aren’t random. <strong>Cursor’s top reason
                    is “introduces bugs / breaks APIs” (46.7%)</strong>; Devin PRs mostly just go inactive (31.6%);
                    Copilot’s are the same bug category (10.7%) plus “doesn’t add value” (8.7%). Rejected PRs skew
                    larger and fail the project’s own CI first.
                  </p>
                  <cite className={styles.cite}>
                    security-PR rejection study · arXiv:2604.19965 &nbsp;|&nbsp; ~33k agent PRs · MSR 2026
                  </cite>
                </div>
              </div>

              <div className={styles.layer}>
                <div className={styles.stat}>
                  15.4%
                  <span className={styles.statSub}>merged &amp; still broken</span>
                </div>
                <div className={styles.layerBody}>
                  <p>
                    <span className={styles.layerN}>L3</span>Even the PRs that <em>do</em> merge aren’t clean:{" "}
                    <strong>15.4% of merged agent PRs needed a reviewer to fix problems before they could land.</strong>{" "}
                    The safety net is a person, applied after the fact.
                  </p>
                  <cite className={styles.cite}>decision-oriented Agentic-PR study · arXiv:2605.22534</cite>
                </div>
              </div>
            </div>
            <p className={styles.kicker}>
              The agents aren’t short on autonomy. Nothing decides — <em>before</em> the PR opens — whether this agent
              has earned the standing to act unsupervised on this kind of change.
            </p>
          </div>
        </section>

        {/* ---------- 3 · solution ---------- */}
        <section className={slideClass(2)}>
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>
              03 <span>—</span> The solution
            </p>
            <h2 className={styles.slideH}>
              Relay is the trust gate that sits <em>before</em> the PR is opened.
            </h2>
            <p className={styles.lede}>
              A reputation-gated agent swarm that takes a GitHub issue to a ready-to-merge PR — with every handoff gated
              by a live, verifiable trust score, and the human’s review effort calibrated to earned trust.
            </p>
            <div className={styles.pillars}>
              <div className={styles.pillar}>
                <h3>
                  <i />
                  Reputation-gated swarm
                </h3>
                <p>
                  Planner → Coder → Tester → Reviewer. The Planner declares a scope; the Coder is tool-locked to it.
                  Every handoff is checked against the Coder’s live trust score, <strong>scoped per task category</strong>{" "}
                  — not one blanket number.
                </p>
              </div>
              <div className={styles.pillar}>
                <h3>
                  <i />
                  Signed, verifiable identity
                </h3>
                <p>
                  Each agent holds a real W3C <code>did:key</code> (Ed25519). Every attempt is signed and independently
                  verifiable with no lookup. Edit a record in the database and the badge flips <strong>✓ → ✗</strong>{" "}
                  live.
                </p>
              </div>
              <div className={styles.pillar}>
                <h3>
                  <i />
                  Trust earned from real outcomes
                </h3>
                <p>
                  The score moves on test-verified and human-verified results only — never self-report.{" "}
                  <code>trust = (tests_ok + 3·approvals + 1) / (tests_total + 3·(approvals+rejections) + 2)</code> — a
                  human merge counts <strong>3× a passing test</strong>.
                </p>
              </div>
              <div className={styles.pillar}>
                <h3>
                  <i />
                  Calibrated review, not blind autonomy
                </h3>
                <p>
                  Proven agent, in scope, tests pass → a <strong>fast-approve</strong> PR, one click to ship. Low
                  confidence, scope drift or a sensitive path → a <strong>flagged review</strong> with a full decision
                  packet: exactly what Relay is unsure about.
                </p>
              </div>
            </div>
            <div className={styles.ruleBand}>
              <span className={styles.lock}>⬤ rule</span>
              <span>
                <b>Relay never merges.</b> A human always makes the final call — trust only decides how hard they have to
                look.
              </span>
            </div>
          </div>
        </section>

        {/* ---------- 4 · how it works ---------- */}
        <section className={`${slideClass(3)} ${styles.flow}`}>
          <div className={`${styles.wrap} ${styles.wrapWide}`}>
            <p className={styles.eyebrow}>
              04 <span>—</span> How it works
            </p>
            <h2 className={styles.slideH}>One issue, end to end — four Claude agents, every handoff signed.</h2>
            <figure className={styles.figure}>
              <div className={styles.flowCard}>
                <svg
                  viewBox="0 6 1180 434"
                  role="img"
                  aria-label="Flow: a GitHub issue triggers a webhook into the Coordinator, which drives four Claude agents — Planner, then a trust gate, then Coder, Tester and Reviewer, each producing an Ed25519-signed attempt. The Reviewer opens a pull request as either fast-approve or flagged review. A human reviews and, on approve, the PR is squash-merged. The human's decision feeds back into the agents' trust score."
                >
                  <defs>
                    <marker id="pd-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M0 0L10 5L0 10z" fill="#2f3950" />
                    </marker>
                    <marker id="pd-ar-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                      <path d="M0 0L10 5L0 10z" fill="#0175ff" />
                    </marker>
                    <g id="pd-gh">
                      <path
                        fill="#e6edf3"
                        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
                      />
                    </g>
                    <g id="pd-claude" fill="#d97757">
                      <rect x="-1.15" y="-10.5" width="2.3" height="7" rx="1.15" />
                      <rect x="-1.15" y="-8" width="2.3" height="4.8" rx="1.15" transform="rotate(30)" />
                      <rect x="-1.15" y="-10.5" width="2.3" height="7" rx="1.15" transform="rotate(60)" />
                      <rect x="-1.15" y="-8" width="2.3" height="4.8" rx="1.15" transform="rotate(90)" />
                      <rect x="-1.15" y="-10.5" width="2.3" height="7" rx="1.15" transform="rotate(120)" />
                      <rect x="-1.15" y="-8" width="2.3" height="4.8" rx="1.15" transform="rotate(150)" />
                      <rect x="-1.15" y="-10.5" width="2.3" height="7" rx="1.15" transform="rotate(180)" />
                      <rect x="-1.15" y="-8" width="2.3" height="4.8" rx="1.15" transform="rotate(210)" />
                      <rect x="-1.15" y="-10.5" width="2.3" height="7" rx="1.15" transform="rotate(240)" />
                      <rect x="-1.15" y="-8" width="2.3" height="4.8" rx="1.15" transform="rotate(270)" />
                      <rect x="-1.15" y="-10.5" width="2.3" height="7" rx="1.15" transform="rotate(300)" />
                      <rect x="-1.15" y="-8" width="2.3" height="4.8" rx="1.15" transform="rotate(330)" />
                      <circle r="2.6" />
                    </g>
                  </defs>

                  <rect x="18" y="138" width="136" height="96" rx="12" fill="#06070a" stroke="#2f3950" strokeWidth="1.5" />
                  <use href="#pd-gh" transform="translate(75.5,150) scale(1.35)" />
                  <text x="86" y="196" textAnchor="middle" fill="#fff" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600">GitHub issue</text>
                  <text x="86" y="213" textAnchor="middle" fill="#9ba9c4" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">opened</text>

                  <rect x="196" y="150" width="132" height="70" rx="12" fill="#06070a" stroke="#2f3950" strokeWidth="1.5" strokeDasharray="4 3" />
                  <text x="262" y="178" textAnchor="middle" fill="#fff" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600">Coordinator</text>
                  <text x="262" y="196" textAnchor="middle" fill="#9ba9c4" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">plain code · not an LLM</text>

                  <rect x="360" y="96" width="600" height="182" rx="16" fill="rgba(1,117,255,0.1)" stroke="rgba(1,117,255,0.45)" strokeWidth="1.5" />
                  <use href="#pd-claude" transform="translate(378,113) scale(0.95)" />
                  <text x="394" y="117" fill="#0175ff" fontFamily="ui-monospace, Menlo, monospace" fontSize="11" fontWeight="700" letterSpacing="0.04em">CLAUDE · FOUR AGENTS — every handoff Ed25519-signed</text>

                  <rect x="376" y="150" width="120" height="70" rx="11" fill="#06070a" stroke="#2f3950" strokeWidth="1.5" />
                  <use href="#pd-claude" transform="translate(436,147) scale(0.62)" />
                  <text x="436" y="178" textAnchor="middle" fill="#fff" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600">Planner</text>
                  <text x="436" y="195" textAnchor="middle" fill="#9ba9c4" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">plan + scope</text>
                  <text x="436" y="240" textAnchor="middle" fill="#24d68a" fontFamily="ui-monospace, Menlo, monospace" fontSize="9.5" fontWeight="700">✓ signed</text>

                  <path d="M556 152 L588 184 L556 216 L524 184 Z" fill="rgba(255,172,10,0.16)" stroke="#ffac0a" strokeWidth="1.5" />
                  <text x="556" y="245" textAnchor="middle" fill="#9ba9c4" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">trust gate</text>

                  <rect x="616" y="150" width="112" height="70" rx="11" fill="#06070a" stroke="#2f3950" strokeWidth="1.5" />
                  <use href="#pd-claude" transform="translate(672,147) scale(0.62)" />
                  <text x="672" y="178" textAnchor="middle" fill="#fff" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600">Coder</text>
                  <text x="672" y="195" textAnchor="middle" fill="#9ba9c4" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">tool-locked</text>
                  <text x="672" y="240" textAnchor="middle" fill="#24d68a" fontFamily="ui-monospace, Menlo, monospace" fontSize="9.5" fontWeight="700">✓ signed</text>

                  <rect x="742" y="150" width="104" height="70" rx="11" fill="#06070a" stroke="#2f3950" strokeWidth="1.5" />
                  <use href="#pd-claude" transform="translate(794,147) scale(0.62)" />
                  <text x="794" y="178" textAnchor="middle" fill="#fff" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600">Tester</text>
                  <text x="794" y="195" textAnchor="middle" fill="#9ba9c4" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">regression?</text>
                  <text x="794" y="240" textAnchor="middle" fill="#24d68a" fontFamily="ui-monospace, Menlo, monospace" fontSize="9.5" fontWeight="700">✓ signed</text>

                  <rect x="860" y="150" width="88" height="70" rx="11" fill="#06070a" stroke="#2f3950" strokeWidth="1.5" />
                  <use href="#pd-claude" transform="translate(904,147) scale(0.62)" />
                  <text x="904" y="176" textAnchor="middle" fill="#fff" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600">Review</text>
                  <text x="904" y="194" textAnchor="middle" fill="#9ba9c4" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">vs scope</text>
                  <text x="904" y="240" textAnchor="middle" fill="#24d68a" fontFamily="ui-monospace, Menlo, monospace" fontSize="9.5" fontWeight="700">✓ signed</text>

                  <rect x="1000" y="60" width="164" height="66" rx="12" fill="#06070a" stroke="#2f3950" strokeWidth="1.5" />
                  <text x="1082" y="88" textAnchor="middle" fill="#fff" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600">PR opened</text>
                  <text x="1082" y="106" textAnchor="middle" fill="#9ba9c4" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">via Octokit</text>

                  <rect x="1000" y="182" width="164" height="66" rx="12" fill="#06070a" stroke="#2f3950" strokeWidth="1.5" />
                  <text x="1082" y="210" textAnchor="middle" fill="#fff" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600">Human review</text>
                  <text x="1082" y="228" textAnchor="middle" fill="#9ba9c4" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">the final call</text>

                  <rect x="1000" y="304" width="164" height="66" rx="12" fill="rgba(36,214,138,0.16)" stroke="#24d68a" strokeWidth="1.5" />
                  <text x="1082" y="332" textAnchor="middle" fill="#fff" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600">Squash-merge</text>
                  <text x="1082" y="350" textAnchor="middle" fill="#9ba9c4" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">issue auto-closes</text>

                  <path d="M154 186 H190" fill="none" stroke="#2f3950" strokeWidth="1.6" markerEnd="url(#pd-ar)" />
                  <text x="172" y="177" textAnchor="middle" fill="#5c6779" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">webhook</text>

                  <path d="M328 185 H370" fill="none" stroke="#2f3950" strokeWidth="1.6" markerEnd="url(#pd-ar)" />
                  <text x="349" y="176" textAnchor="middle" fill="#5c6779" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">clone</text>

                  <path d="M496 185 H520" fill="none" stroke="#2f3950" strokeWidth="1.6" markerEnd="url(#pd-ar)" />
                  <path d="M588 185 H610" fill="none" stroke="#2f3950" strokeWidth="1.6" markerEnd="url(#pd-ar)" />
                  <text x="600" y="176" textAnchor="middle" fill="#5c6779" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">proceed / escalate</text>

                  <path d="M728 185 H740" fill="none" stroke="#2f3950" strokeWidth="1.6" markerEnd="url(#pd-ar)" />
                  <path d="M846 185 H858" fill="none" stroke="#2f3950" strokeWidth="1.6" markerEnd="url(#pd-ar)" />

                  <path d="M948 172 C 976 150, 980 110, 998 96" fill="none" stroke="#2f3950" strokeWidth="1.6" markerEnd="url(#pd-ar)" />
                  <text x="1002" y="150" textAnchor="middle" fill="#5c6779" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">opens PR</text>

                  <path d="M1082 126 V178" fill="none" stroke="#2f3950" strokeWidth="1.6" markerEnd="url(#pd-ar)" />
                  <text x="1090" y="156" textAnchor="start" fill="#5c6779" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">fast-approve · flagged</text>

                  <path d="M1082 248 V300" fill="none" stroke="#2f3950" strokeWidth="1.6" markerEnd="url(#pd-ar)" />
                  <text x="1090" y="278" textAnchor="start" fill="#5c6779" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">approve</text>

                  <path d="M1000 224 C 720 430, 470 430, 470 300 L 470 262" fill="none" stroke="#0175ff" strokeWidth="1.6" strokeDasharray="5 4" markerEnd="url(#pd-ar-b)" />
                  <text x="700" y="424" textAnchor="middle" fill="#0175ff" fontFamily="ui-monospace, Menlo, monospace" fontSize="10.5">merge decision → trust score (×3 weight)</text>
                </svg>
              </div>
            </figure>
          </div>
        </section>

        {/* ---------- 5 · comparison ---------- */}
        <section className={slideClass(4)}>
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>
              05 <span>—</span> Relay vs the field
            </p>
            <h2 className={styles.slideH}>
              Everyone else asks whether an agent <em>can</em>. Relay asks whether it has <em>earned it</em>.
            </h2>
            <div className={styles.cmpScroll}>
              <table className={styles.cmp}>
                <thead>
                  <tr>
                    <th scope="col">Capability</th>
                    <th scope="col">Copilot coding agent</th>
                    <th scope="col">OpenHands</th>
                    <th scope="col">CodeRabbit</th>
                    <th scope="col" className={styles.colRelay}>
                      <span className={styles.relayStar}>★</span> Relay
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {CMP_ROWS.map((row) => (
                    <tr key={row.cap}>
                      <th scope="row">{row.cap}</th>
                      {row.cells.map((cell, i) => {
                        const [tone, note] = cell;
                        const isRelay = i === 3;
                        return (
                          <td
                            key={i}
                            className={[styles.cell, styles[tone], isRelay ? styles.colRelay : ""]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            <span className={styles.mark} aria-hidden="true">
                              {MARK[tone]}
                            </span>
                            {note && <span className={styles.cellNote}>{note}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.vsNotes}>
              <p>
                <b>vs CodeRabbit</b> — reviews any diff after it exists, at one fixed depth, with no reputation. Relay
                decides <em>before</em> the PR whether the agent should act, and calibrates the human’s scrutiny.
              </p>
              <p>
                <b>vs Copilot / OpenHands</b> — one fixed process, every PR reviewed identically, no identity, no
                earned trust. In Relay, scrutiny is a function of what the agent has proven on this kind of change.
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className={styles.controls}>
        <button className={styles.navBtn} onClick={prev} disabled={index === 0} aria-label="Previous slide">
          ‹
        </button>
        <span className={styles.count}>
          {pad(index + 1)} <span>/</span> {pad(COUNT)}
        </span>
        <button className={styles.navBtn} onClick={next} disabled={index === COUNT - 1} aria-label="Next slide">
          ›
        </button>
      </div>
    </div>
  );
}
