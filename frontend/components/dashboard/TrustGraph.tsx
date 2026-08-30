"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/lib/supabase";
import { verifyAttempt } from "@/lib/verify";
import type { AgentRow, AttemptRow, ReputationRow, TaskRow, Outcome } from "@/lib/types";
import { STEP_INDEX } from "@/lib/types";
import { STATUS_COLOR, relativeTime } from "@/lib/ui";
import { AttemptNode, type AttemptNodeData } from "./AttemptNode";
import styles from "@/app/dashboard/dashboard.module.css";

const nodeTypes = { attempt: AttemptNode };
const COL_W = 300;
const OUTCOME_COLOR: Record<Outcome, string> = {
  passed: "#0175ff",
  escalated: "#ffac0a",
  failed: "#ff2244",
  human_override: "#ffcd7d",
};

interface Data {
  agents: AgentRow[];
  tasks: TaskRow[];
  attempts: AttemptRow[];
  reputation: ReputationRow[];
}

export function TrustGraph() {
  const [data, setData] = useState<Data | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [tampering, setTampering] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [a, t, at, r] = await Promise.all([
      supabase.from("agents").select("*"),
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("task_attempts").select("*").order("created_at"),
      supabase.from("reputation_scores").select("*"),
    ]);
    const err = a.error || t.error || at.error || r.error;
    if (err) { setError(err.message); return; }
    setError(null);
    setData({
      agents: (a.data ?? []) as AgentRow[],
      tasks: (t.data ?? []) as TaskRow[],
      attempts: (at.data ?? []) as AttemptRow[],
      reputation: (r.data ?? []) as ReputationRow[],
    });
  }, []);

  useEffect(() => {
    load();
    const scheduleRefetch = () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(load, 250);
    };
    const ch = supabase
      .channel("relay-graph")
      .on("postgres_changes", { event: "*", schema: "public", table: "task_attempts" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "reputation_scores" }, scheduleRefetch)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
  }, [load]);

  // default to the newest issue once data arrives
  useEffect(() => {
    if (data && !selectedTask && data.tasks.length) setSelectedTask(data.tasks[0].id);
  }, [data, selectedTask]);

  const onTamper = useCallback(async (row: AttemptRow) => {
    const signed = (row.payload as { outcome?: Outcome }).outcome ?? "passed";
    const consistent = signed === row.outcome;
    const next: Outcome = consistent ? (signed === "passed" ? "failed" : "passed") : signed;
    setTampering(row.id);
    const { error } = await supabase.from("task_attempts").update({ outcome: next }).eq("id", row.id);
    setTampering(null);
    if (error) setError(`tamper failed: ${error.message}`);
    else load();
  }, [load]);

  const { computedNodes, computedEdges } = useMemo(() => {
    if (!data || !selectedTask) return { computedNodes: [] as Node[], computedEdges: [] as Edge[] };
    const task = data.tasks.find((t) => t.id === selectedTask);
    if (!task) return { computedNodes: [], computedEdges: [] };

    const agentById = new Map(data.agents.map((a) => [a.id, a]));
    const repByKey = new Map(data.reputation.map((r) => [`${r.agent_id}|${r.task_type}`, r.score]));
    const rows = data.attempts.filter((a) => a.task_id === selectedTask);

    const ns: Node[] = rows.map((row) => {
      const agent = agentById.get(row.agent_id);
      const rep = agent ? repByKey.get(`${agent.id}|${task.task_type}`) ?? null : null;
      const nodeData: AttemptNodeData = {
        row,
        agentName: agent?.name ?? "",
        taskTitle: task.issue_title ?? `${task.repo ?? ""} #${task.issue_number ?? "?"}`,
        reputation: rep,
        verification: verifyAttempt(row),
        selected: selectedNode === row.id,
        tampering: tampering === row.id,
        onTamper,
      };
      return {
        id: row.id,
        type: "attempt",
        position: { x: STEP_INDEX[row.step] * COL_W, y: 0 },
        data: nodeData,
      };
    });

    const es: Edge[] = rows
      .filter((row) => row.parent_attempt_id)
      .map((row) => ({
        id: `${row.parent_attempt_id}->${row.id}`,
        source: row.parent_attempt_id!,
        target: row.id,
        animated: row.outcome === "passed",
        style: { stroke: OUTCOME_COLOR[row.outcome], strokeWidth: 1.5 },
      }));

    return { computedNodes: ns, computedEdges: es };
  }, [data, selectedTask, selectedNode, tampering, onTamper]);

  useEffect(() => setNodes(computedNodes), [computedNodes, setNodes]);
  useEffect(() => setEdges(computedEdges), [computedEdges, setEdges]);

  const stats = useMemo(() => {
    if (!data) return null;
    const verified = data.attempts.filter((r) => verifyAttempt(r).ok).length;
    return {
      tasks: data.tasks.length,
      attempts: data.attempts.length,
      verified,
      tampered: data.attempts.length - verified,
    };
  }, [data]);

  const selectedHasNodes = computedNodes.length > 0;

  return (
    <div className={styles.layout}>
      <div className={styles.graphCard} style={{ position: "relative" }}>
        <ReactFlow
          key={selectedTask ?? "none"}
          colorMode="dark"
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          onNodeClick={(_, n) => setSelectedNode((s) => (s === n.id ? null : n.id))}
          onPaneClick={() => setSelectedNode(null)}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.28 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
        >
          <Background variant={BackgroundVariant.Lines} gap={28} lineWidth={1} color="#1b2740" />
          <Background variant={BackgroundVariant.Dots} gap={28} size={2} color="#31425f" />
          <Controls showInteractive={false} />
        </ReactFlow>
        {!selectedHasNodes && (
          <div className={styles.graphHint}>
            {selectedTask ? "This issue has no signed attempts yet." : "Select an issue on the right."}
          </div>
        )}
      </div>

      <div>
        <div className={styles.panel} style={{ marginBottom: 20 }}>
          <h2 className={styles.panelTitle}>Trust graph</h2>
          {error && <div style={{ color: "#ff2244", fontSize: 12, marginBottom: 10 }}>{error}</div>}
          {stats && (
            <>
              <div className={styles.stat}><span>Issues</span><span className={styles.statVal}>{stats.tasks}</span></div>
              <div className={styles.stat}><span>Signed attempts</span><span className={styles.statVal}>{stats.attempts}</span></div>
              <div className={styles.stat}><span>Verified ✓</span><span className={styles.statVal} style={{ color: "#0175ff" }}>{stats.verified}</span></div>
              <div className={styles.stat}><span>Tampered ✗</span><span className={styles.statVal} style={{ color: "#ff2244" }}>{stats.tampered}</span></div>
            </>
          )}
        </div>

        <div className={styles.panel}>
          <h2 className={styles.panelTitle}>Issues — click to see its workflow</h2>
          <div className={styles.issueList}>
            {(data?.tasks ?? []).map((t) => {
              const active = t.id === selectedTask;
              const n = data!.attempts.filter((a) => a.task_id === t.id).length;
              return (
                <div
                  key={t.id}
                  className={`${styles.issueItem} ${active ? styles.issueItemActive : ""}`}
                  onClick={() => { setSelectedTask(t.id); setSelectedNode(null); }}
                >
                  <div className={styles.issueTitle2}>
                    {t.issue_title ?? `Issue #${t.issue_number ?? "?"}`}
                  </div>
                  <div className={styles.issueMeta2}>
                    <span>{(t.repo ?? "local").split("/").slice(-2).join("/")}</span>
                    <span>· {t.task_type}</span>
                    <span>· {relativeTime(t.created_at)}</span>
                    <span>· {n}/4 steps</span>
                    <span className={styles.miniBadge} style={{ color: STATUS_COLOR[t.status] ?? "#9ba9c4" }}>
                      {t.status}
                    </span>
                    {t.pr_mode && (
                      <span
                        className={styles.miniBadge}
                        style={{ color: t.pr_mode === "fast_approve" ? "#0175ff" : "#ffac0a" }}
                      >
                        {t.pr_mode === "fast_approve" ? "fast" : "flagged"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {data && data.tasks.length === 0 && <div className={styles.empty}>No issues yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
