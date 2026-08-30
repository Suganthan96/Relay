"use client";

import { useEffect, useRef, useState } from "react";
import { Shell } from "@/components/dashboard/Shell";
import { useRelayData, attemptsByTask } from "@/lib/data";
import { verifyAttempt } from "@/lib/verify";
import { OUTCOME_COLOR, STATUS_COLOR, relativeTime } from "@/lib/ui";
import { STEP_LABEL, type AttemptRow, type PipelineStep } from "@/lib/types";
import styles from "@/app/dashboard/dashboard.module.css";

const STEP_ORDER: PipelineStep[] = ["plan", "code", "test", "review"];
const PR_STATUS = new Set(["pr_opened", "merged", "rejected"]);

type Filter = "issues" | "prs" | "all";

/** A task has a pull request once it reaches pr_opened / merged / rejected. */
function hasPr(t: { pr_number: number | null; status: string }): boolean {
  return t.pr_number != null || PR_STATUS.has(t.status);
}

export default function TasksPage() {
  const { tasks, attempts, agents, loading, error } = useRelayData();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("issues");
  const byTask = attemptsByTask(attempts);
  const agentById = new Map(agents.map((a) => [a.id, a]));

  const counts = {
    issues: tasks.filter((t) => !hasPr(t)).length,
    prs: tasks.filter(hasPr).length,
    all: tasks.length,
  };
  const shown = tasks.filter((t) =>
    filter === "all" ? true : filter === "prs" ? hasPr(t) : !hasPr(t),
  );

  return (
    <Shell
      title="Issue pipeline"
      subtitle="One row per GitHub issue Relay picked up. Expand a task to see its full run: the Planner's plan, the Coder's diff, the Tester's result, and the Reviewer's decision."
    >
      {error && <div style={{ color: "#ff2244", fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div className={styles.tabs} style={{ margin: "0 0 20px" }}>
        {([
          ["issues", `Issues in progress (${counts.issues})`],
          ["prs", `Pull requests (${counts.prs})`],
          ["all", `All (${counts.all})`],
        ] as [Filter, string][]).map(([key, label]) => (
          <button
            key={key}
            className={`${styles.tab} ${filter === key ? styles.tabActive : ""}`}
            style={{ background: "none", border: "none", cursor: "pointer", font: "inherit" }}
            onClick={() => { setFilter(key); setOpen(null); }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div className={styles.empty}>Loading…</div>}
      {!loading && shown.length === 0 && (
        <div className={styles.empty}>
          {tasks.length === 0 ? "No tasks yet." : `Nothing in "${filter}".`}
        </div>
      )}

      {shown.map((task) => {
        const steps = byTask.get(task.id) ?? [];
        const isOpen = open === task.id;
        return (
          <div key={task.id} className={styles.taskRow}>
            <div className={styles.taskHead} onClick={() => setOpen(isOpen ? null : task.id)}>
              <span style={{ color: "var(--muted)", fontSize: 12 }}>{isOpen ? "▾" : "▸"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className={styles.taskTitle}>
                  {task.issue_title ?? `Issue #${task.issue_number ?? "?"}`}
                </div>
                <div className={styles.taskSub}>
                  {(task.repo ?? "local").split("/").slice(-2).join("/")} · {task.task_type} ·{" "}
                  {relativeTime(task.created_at)} · {steps.length} signed attempt
                  {steps.length === 1 ? "" : "s"}
                  {task.pr_url && (
                    <>
                      {" · "}
                      <a
                        className={styles.link}
                        href={task.pr_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        PR #{task.pr_number} ↗
                      </a>
                    </>
                  )}
                </div>
              </div>
              {task.pr_mode && (
                <span
                  className={styles.statusBadge}
                  style={{
                    color: task.pr_mode === "fast_approve" ? "#0175ff" : "#ffac0a",
                    borderColor: "currentColor",
                  }}
                >
                  {task.pr_mode === "fast_approve" ? "fast-approve" : "flagged"}
                </span>
              )}
              <span
                className={styles.statusBadge}
                style={{ color: STATUS_COLOR[task.status] ?? "#9ba9c4", borderColor: "currentColor" }}
              >
                {task.status}
              </span>
            </div>

            {isOpen && (
              <div className={styles.taskBody}>
                {STEP_ORDER.map((step) => {
                  const a = steps.find((s) => s.step === step);
                  return (
                    <StepCard
                      key={step}
                      step={step}
                      attempt={a}
                      agentName={a ? agentById.get(a.agent_id)?.name : undefined}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </Shell>
  );
}

function StepCard({
  step,
  attempt,
  agentName,
}: {
  step: PipelineStep;
  attempt?: AttemptRow;
  agentName?: string;
}) {
  if (!attempt) {
    return (
      <div className={styles.stepCard} style={{ opacity: 0.45 }}>
        <div className={styles.stepCardName}>{STEP_LABEL[step]}</div>
        <div className={styles.mono}>not reached</div>
      </div>
    );
  }
  const v = verifyAttempt(attempt);
  const d = (attempt.detail ?? {}) as Record<string, unknown>;
  const color = OUTCOME_COLOR[attempt.outcome];

  return (
    <div className={styles.stepCard}>
      <div className={styles.stepCardHead}>
        <span className={styles.stepCardName}>{agentName ?? STEP_LABEL[step]}</span>
        <span style={{ color: v.ok ? "#0175ff" : "#ff2244" }}>{v.ok ? "✓" : "✗"}</span>
      </div>
      <div className={styles.row} style={{ marginTop: 0 }}>
        <span className={styles.pill} style={{ background: `${color}22`, color }}>{attempt.outcome}</span>
        {attempt.scope_adhered === false && (
          <span className={styles.meta} style={{ color: "#ffac0a" }}>out of scope</span>
        )}
      </div>

      {step === "plan" && typeof d.plan === "string" && (
        <Expandable text={d.plan} />
      )}
      {step === "code" && (
        <>
          {typeof d.summary === "string" && <Expandable text={d.summary} lines={4} />}
          {Array.isArray(d.filesChanged) && (d.filesChanged as string[]).length > 0 && (
            <div className={styles.mono} style={{ marginTop: 4 }}>
              {(d.filesChanged as string[]).join(", ")}
            </div>
          )}
          {typeof d.patch === "string" && (d.patch as string).length > 0 && (
            <ExpandableDiff patch={d.patch as string} />
          )}
        </>
      )}
      {step === "test" && typeof d.summary === "string" && (
        <Expandable text={d.summary} />
      )}
      {step === "review" && (
        <>
          {typeof d.summary === "string" && <Expandable text={d.summary} />}
          {Array.isArray(d.concerns) &&
            (d.concerns as string[]).map((c, i) => (
              <div key={i} className={styles.concern} style={{ marginTop: 3 }}>• {c}</div>
            ))}
        </>
      )}
    </div>
  );
}

/** Clamp long text to `lines`; show a ▼/▲ toggle when it overflows. */
function Expandable({ text, lines = 6 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 4);
  }, [text, open]);
  return (
    <div style={{ marginTop: 6 }}>
      <div
        ref={ref}
        className={styles.clamp}
        style={{ maxHeight: open ? "none" : `${lines * 1.5}em` }}
      >
        {text}
      </div>
      {(overflows || open) && (
        <button className={styles.moreBtn} onClick={() => setOpen(!open)}>
          {open ? "▲ show less" : "▼ show more"}
        </button>
      )}
    </div>
  );
}

/** Diff box: horizontal scroll always, vertical clamp with a ▼/▲ toggle. */
function ExpandableDiff({ patch }: { patch: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <pre
        className={styles.diffBox}
        style={{ maxHeight: open ? 480 : 160 }}
      >
        {patch}
      </pre>
      {patch.split("\n").length > 8 && (
        <button className={styles.moreBtn} onClick={() => setOpen(!open)}>
          {open ? "▲ collapse diff" : "▼ expand diff"}
        </button>
      )}
    </>
  );
}

