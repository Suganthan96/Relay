"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import styles from "@/app/dashboard/dashboard.module.css";
import type { AttemptRow, Outcome, PipelineStep } from "@/lib/types";
import { STEP_LABEL } from "@/lib/types";
import type { Verification } from "@/lib/verify";

const OUTCOME_COLOR: Record<Outcome, string> = {
  passed: "#0175ff",
  escalated: "#ffac0a",
  failed: "#ff2244",
  human_override: "#ffcd7d",
};

/** One-line-ish summary of what this agent actually did, from its signed detail. */
function whatItDid(row: AttemptRow): string {
  const d = (row.detail ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
  switch (row.step) {
    case "plan":
      return str("plan") || "Proposed a plan and declared the scope of the change.";
    case "code": {
      const s = str("summary").replace(/^DONE\s*/i, "");
      const files = Array.isArray(d.filesChanged) ? (d.filesChanged as string[]) : [];
      const base = s || "Applied the change.";
      return files.length ? `${base}${/[.!?]$/.test(base) ? "" : "."} Edited ${files.join(", ")}.` : base;
    }
    case "test":
      return str("summary") || "Ran the project's test suite.";
    case "review": {
      const s = str("summary") || "Reviewed the diff against the declared scope.";
      const mode =
        d.prMode === "fast_approve"
          ? " → opened as fast-approve"
          : d.prMode === "flagged_review"
            ? " → flagged for human review"
            : "";
      return s + mode;
    }
    default:
      return "";
  }
}

export interface AttemptNodeData extends Record<string, unknown> {
  row: AttemptRow;
  agentName: string;
  taskTitle: string;
  reputation: number | null;
  verification: Verification;
  selected: boolean;
  tampering: boolean;
  onTamper: (row: AttemptRow) => void;
}

export function AttemptNode({ data }: NodeProps) {
  const d = data as AttemptNodeData;
  const { row, verification: v } = d;
  const color = OUTCOME_COLOR[row.outcome];
  const step = row.step as PipelineStep;

  return (
    <div className={`${styles.node} ${d.selected ? styles.nodeSelected : ""}`}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />

      <div className={styles.nodeHead}>
        <div>
          <div className={styles.agent}>{d.agentName || STEP_LABEL[step]}</div>
          <div className={styles.step}>{step}</div>
        </div>
        <span
          className={`${styles.badge} ${v.ok ? styles.badgeOk : styles.badgeBad}`}
          title={
            v.ok
              ? "signature valid, record unchanged"
              : v.signatureValid
                ? `record altered: ${v.mismatch.join("; ")}`
                : "signature invalid"
          }
        >
          {v.ok ? "✓ verified" : "✗ tampered"}
        </span>
      </div>

      <div className={styles.row}>
        <span className={styles.pill} style={{ background: `${color}22`, color }}>
          {row.outcome}
        </span>
        {row.confidence_score != null && (
          <span className={styles.meta}>conf {Math.round(row.confidence_score * 100)}%</span>
        )}
        {row.scope_adhered === false && <span className={styles.meta} style={{ color: "#ffac0a" }}>out of scope</span>}
      </div>

      <div
        className={styles.nodeDesc}
        style={d.selected ? { maxHeight: "none", WebkitLineClamp: "unset" } : undefined}
      >
        {whatItDid(row)}
      </div>

      {d.reputation != null && (
        <>
          <div className={styles.repBar}>
            <div className={styles.repFill} style={{ width: `${Math.round(d.reputation * 100)}%` }} />
          </div>
          <div className={styles.meta} style={{ marginTop: 4 }}>
            reputation {d.reputation.toFixed(2)} · {row.task_id.slice(0, 6)}
          </div>
        </>
      )}

      {d.selected && (
        <div className={styles.nodeDetail}>
          <div style={{ color: "#fff", fontWeight: 600, marginBottom: 4 }}>{d.taskTitle}</div>
          {row.scope_declared && <div>scope: {row.scope_declared.slice(0, 160)}</div>}
          {Array.isArray((row.detail as any)?.concerns) &&
            (row.detail as any).concerns.slice(0, 4).map((c: string, i: number) => (
              <div key={i} className={styles.concern}>• {c}</div>
            ))}
          {!v.ok && v.signatureValid && (
            <div style={{ color: "#ff2244", marginTop: 4 }}>{v.mismatch.join("; ")}</div>
          )}
          <button
            className={`${styles.btnCosmoq} ${styles.btnCosmoqSm} ${styles.btnCosmoqFull} ${v.consistent ? styles.btnCosmoqDanger : ""}`}
            style={{ marginTop: 10 }}
            disabled={d.tampering}
            onClick={() => d.onTamper(row)}
          >
            {d.tampering
              ? "writing…"
              : v.consistent
                ? "Tamper: flip outcome in DB"
                : "Restore signed outcome"}
          </button>
        </div>
      )}
    </div>
  );
}
