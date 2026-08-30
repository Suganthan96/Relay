"use client";

import { useState } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { useRelayData } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { verifyAttempt } from "@/lib/verify";
import type { AgentRow, AttemptRow, Outcome, ReputationRow } from "@/lib/types";
import styles from "@/app/dashboard/dashboard.module.css";

export default function AgentsPage() {
  const { agents, attempts, reputation, loading, error, refetch } = useRelayData();
  const [busy, setBusy] = useState<string | null>(null);

  async function tamper(row: AttemptRow) {
    const signed = (row.payload as { outcome?: Outcome }).outcome ?? "passed";
    const consistent = signed === row.outcome;
    const next: Outcome = consistent ? (signed === "passed" ? "failed" : "passed") : signed;
    setBusy(row.id);
    await supabase.from("task_attempts").update({ outcome: next }).eq("id", row.id);
    setBusy(null);
    refetch();
  }

  return (
    <Shell
      title="Agent identities"
      subtitle="Each role holds a real Ed25519 keypair wrapped as a W3C did:key — self-certifying, no registry, no chain. Every attempt it makes is signed; anyone can verify it against the DID with no lookup."
    >
      {error && <div style={{ color: "#ff2244", fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {loading && <div className={styles.empty}>Loading…</div>}

      <div className={styles.agentGrid}>
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            reputation={reputation.filter((r) => r.agent_id === agent.id)}
            latest={attempts
              .filter((a) => a.agent_id === agent.id)
              .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]}
            busy={busy}
            onTamper={tamper}
          />
        ))}
      </div>
    </Shell>
  );
}

function AgentCard({
  agent,
  reputation,
  latest,
  busy,
  onTamper,
}: {
  agent: AgentRow;
  reputation: ReputationRow[];
  latest?: AttemptRow;
  busy: string | null;
  onTamper: (row: AttemptRow) => void;
}) {
  const v = latest ? verifyAttempt(latest) : null;
  return (
    <div className={styles.agentCard}>
      <div className={styles.agentName}>{agent.name}</div>
      <div className={styles.agentDid}>{agent.did}</div>

      <div className={styles.panelTitle} style={{ margin: "0 0 8px" }}>Reputation by task type</div>
      {reputation.length === 0 && <div className={styles.empty}>No verified history yet.</div>}
      {reputation
        .slice()
        .sort((a, b) => b.total_count - a.total_count)
        .map((r) => {
          const appr = r.human_approvals ?? 0;
          const rej = r.human_rejections ?? 0;
          return (
            <div key={r.task_type} className={styles.repRow}>
              <span className={styles.repName}>{r.task_type}</span>
              <span className={styles.repTrack}>
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    width: `${Math.round(r.score * 100)}%`,
                    background: "linear-gradient(90deg,#0175ff,#ffcd7d)",
                  }}
                />
              </span>
              <span
                className={styles.repVal}
                title={`trust ${r.score.toFixed(2)} · tests ${r.success_count}/${r.total_count} · human 👍${appr} 👎${rej}`}
              >
                {r.score.toFixed(2)}
                {(appr > 0 || rej > 0) && (
                  <span style={{ color: "#9ba9c4" }}>
                    {" "}👍{appr} 👎{rej}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      <div className={styles.meta} style={{ marginTop: 6, fontSize: 10 }}>
        trust = (tests_ok + 3·approvals + 1) / (tests_total + 3·(approvals+rejections) + 2)
      </div>

      {latest && v && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div className={styles.panelTitle} style={{ margin: "0 0 8px" }}>
            Signature check — latest attempt
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
            <span className={`${styles.badge} ${v.ok ? styles.badgeOk : styles.badgeBad}`}>
              {v.ok ? "✓ verified" : "✗ tampered"}
            </span>
            <span className={styles.meta}>{latest.step} · {latest.outcome}</span>
          </div>
          {!v.ok && v.signatureValid && (
            <div style={{ color: "#ff2244", fontSize: 11, marginTop: 6 }}>{v.mismatch.join("; ")}</div>
          )}
          {!v.signatureValid && (
            <div style={{ color: "#ff2244", fontSize: 11, marginTop: 6 }}>
              signature does not verify against the DID
            </div>
          )}
          <button
            className={`${styles.btnCosmoq} ${styles.btnCosmoqSm} ${styles.btnCosmoqFull} ${v.consistent ? styles.btnCosmoqDanger : ""}`}
            style={{ marginTop: 10 }}
            disabled={busy === latest.id}
            onClick={() => onTamper(latest)}
          >
            {busy === latest.id
              ? "writing…"
              : v.consistent
                ? "Tamper: flip this outcome in the DB"
                : "Restore signed outcome"}
          </button>
        </div>
      )}
    </div>
  );
}
