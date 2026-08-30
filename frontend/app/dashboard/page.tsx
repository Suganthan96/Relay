"use client";

import Link from "next/link";
import { Shell } from "@/components/dashboard/Shell";
import { useRelayData } from "@/lib/data";
import { verifyAttempt } from "@/lib/verify";
import { OUTCOME_COLOR, relativeTime } from "@/lib/ui";
import { STEP_LABEL } from "@/lib/types";
import styles from "./dashboard.module.css";

const ACTIVE = new Set(["planning", "coding", "testing", "reviewing"]);
const PENDING = new Set(["reviewing", "pr_opened", "escalated"]);

export default function OverviewPage() {
  const { tasks, attempts, agents, loading, error } = useRelayData();

  const active = tasks.filter((t) => ACTIVE.has(t.status)).length;
  const pending = tasks.filter((t) => PENDING.has(t.status) || t.pr_mode).length;
  const verified = attempts.filter((a) => verifyAttempt(a).ok).length;
  const tampered = attempts.length - verified;
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const feed = [...attempts].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10);

  return (
    <Shell
      title="Relay overview"
      subtitle="A reputation-gated agent swarm that prepares GitHub fixes end-to-end — and never merges without a human's final approval."
    >
      {error && <div style={{ color: "#ff2244", fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div className={styles.cardGrid}>
        <Stat label="Active tasks" value={active} sub={`${tasks.length} total picked up`} />
        <Stat label="Awaiting a human" value={pending} sub="fast-approve or flagged" accent="#ffac0a" />
        <Stat label="Signed attempts" value={attempts.length} sub={`${agents.length} agent identities`} />
        <Stat
          label="Verified / tampered"
          value={`${verified} / ${tampered}`}
          sub="Ed25519, checked in-browser"
          accent={tampered ? "#ff2244" : "#0175ff"}
        />
      </div>

      <div className={styles.twoCol}>
        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Recent activity</h2>
          {loading && <div className={styles.empty}>Loading…</div>}
          {!loading && feed.length === 0 && <div className={styles.empty}>No attempts yet.</div>}
          {feed.map((a) => {
            const v = verifyAttempt(a);
            return (
              <div key={a.id} className={styles.feedItem}>
                <span className={styles.feedDot} style={{ background: OUTCOME_COLOR[a.outcome] }} />
                <span>
                  <strong>{agentById.get(a.agent_id)?.name ?? STEP_LABEL[a.step]}</strong>{" "}
                  {a.step} → <span style={{ color: OUTCOME_COLOR[a.outcome] }}>{a.outcome}</span>
                  {!v.ok && <span style={{ color: "#ff2244" }}> · tampered ✗</span>}
                </span>
                <span className={styles.feedWhen}>{relativeTime(a.created_at)}</span>
              </div>
            );
          })}
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Jump in</h2>
          <QuickLink href="/graph" title="Live trust graph" desc="Watch nodes appear as the pipeline runs" />
          <QuickLink href="/tasks" title="Issue pipeline" desc="Per-issue: plan → diff → tests → decision" />
          <QuickLink href="/approvals" title="Human review queue" desc="Approve / reject — the final call" />
          <QuickLink href="/agents" title="Agent identities" desc="DIDs, reputation, signature demo" />
        </div>
      </div>
    </Shell>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: number | string; sub: string; accent?: string }) {
  return (
    <div className={styles.bigStat}>
      <div className={styles.bigStatLabel}>{label}</div>
      <div className={styles.bigStatValue} style={accent ? { color: accent } : undefined}>{value}</div>
      <div className={styles.bigStatSub}>{sub}</div>
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className={styles.quickLink}>
      {title}
      <div className={styles.quickLinkDesc}>{desc}</div>
    </Link>
  );
}
