"use client";

import { useState } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { useRelayData, attemptsByTask } from "@/lib/data";
import { relativeTime } from "@/lib/ui";
import type { TaskRow, AttemptRow } from "@/lib/types";
import styles from "@/app/dashboard/dashboard.module.css";

const API = process.env.NEXT_PUBLIC_RELAY_API ?? "http://localhost:8787";
const DECIDED = new Set(["merged", "rejected", "failed"]);

export default function ApprovalsPage() {
  const { tasks, attempts, loading, error, refetch } = useRelayData();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const byTask = attemptsByTask(attempts);

  const queue = tasks.filter(
    (t) =>
      (t.pr_mode || ["reviewing", "pr_opened", "escalated"].includes(t.status)) &&
      !DECIDED.has(t.status),
  );
  const fast = queue.filter((t) => t.pr_mode === "fast_approve");
  const flagged = queue.filter((t) => t.pr_mode !== "fast_approve");

  async function decide(task: TaskRow, decision: "approve" | "reject") {
    setBusy(task.id);
    setMsg(null);
    try {
      const r = await fetch(`${API}/api/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, decision }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      setMsg(`${task.issue_title ?? task.id} → ${j.status}${j.merged ? " (PR merged)" : ""}`);
      refetch();
    } catch (e) {
      setMsg(`Failed: ${(e as Error).message}. Is the backend running (npm run serve)?`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Shell
      title="Human review queue"
      subtitle="A human always makes the final merge call — Relay never merges on its own. Reputation only decides how much scrutiny the request asks for."
    >
      {error && <div style={{ color: "#ff2244", fontSize: 13, marginBottom: 16 }}>{error}</div>}
      {msg && <div style={{ color: "#9ba9c4", fontSize: 13, marginBottom: 16 }}>{msg}</div>}
      {loading && <div className={styles.empty}>Loading…</div>}

      <div className={styles.sectionHead} style={{ color: "#0175ff" }}>
        ✅ Fast-approve — {fast.length}
      </div>
      {fast.length === 0 && <div className={styles.empty}>Nothing waiting on a quick approve.</div>}
      {fast.map((t) => (
        <ApprovalCard key={t.id} task={t} steps={byTask.get(t.id) ?? []} busy={busy === t.id} onDecide={decide} />
      ))}

      <div className={styles.sectionHead} style={{ color: "#ffac0a" }}>
        🚩 Flagged review — {flagged.length}
      </div>
      {flagged.length === 0 && <div className={styles.empty}>No flagged reviews.</div>}
      {flagged.map((t) => (
        <ApprovalCard
          key={t.id}
          task={t}
          steps={byTask.get(t.id) ?? []}
          busy={busy === t.id}
          onDecide={decide}
          flagged
        />
      ))}
    </Shell>
  );
}

function ApprovalCard({
  task,
  steps,
  busy,
  flagged,
  onDecide,
}: {
  task: TaskRow;
  steps: AttemptRow[];
  busy: boolean;
  flagged?: boolean;
  onDecide: (t: TaskRow, d: "approve" | "reject") => void;
}) {
  const review = steps.find((s) => s.step === "review");
  const test = steps.find((s) => s.step === "test");
  const code = steps.find((s) => s.step === "code");
  const rd = (review?.detail ?? {}) as { summary?: string; concerns?: string[] };
  const cd = (code?.detail ?? {}) as { diffStat?: string; filesChanged?: string[] };

  return (
    <div className={styles.approvalCard}>
      <div className={styles.taskTitle}>{task.issue_title ?? `Issue #${task.issue_number ?? "?"}`}</div>
      <div className={styles.taskSub}>
        {(task.repo ?? "local").split("/").slice(-2).join("/")} · {task.task_type} ·{" "}
        {relativeTime(task.created_at)}
        {task.pr_url && (
          <>
            {" · "}
            <a className={styles.link} href={task.pr_url} target="_blank" rel="noreferrer">
              PR #{task.pr_number} ↗
            </a>
          </>
        )}
      </div>

      {rd.summary && <div className={styles.escSummary}>{rd.summary}</div>}

      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
        <span>
          tests:{" "}
          <strong style={{ color: test?.outcome === "passed" ? "#0175ff" : "#ff2244" }}>
            {test?.outcome ?? "—"}
          </strong>
        </span>
        <span>files: {(cd.filesChanged ?? []).length}</span>
      </div>

      {flagged &&
        (rd.concerns ?? []).slice(0, 6).map((c, i) => (
          <div key={i} className={styles.escConcern}>• {c}</div>
        ))}

      <div className={styles.approvalActions}>
        <button
          className={styles.btnCosmoq}
          disabled={busy}
          onClick={() => onDecide(task, "approve")}
        >
          {busy ? "…" : flagged ? "Approve anyway & merge" : "Approve & merge"}
        </button>
        <button
          className={`${styles.btnCosmoq} ${styles.btnCosmoqDanger}`}
          disabled={busy}
          onClick={() => onDecide(task, "reject")}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
