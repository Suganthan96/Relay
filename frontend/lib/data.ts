"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, RELAY_ORG } from "./supabase";
import type { AgentRow, AttemptRow, ReputationRow, TaskRow } from "./types";

export interface RelayData {
  agents: AgentRow[];
  tasks: TaskRow[];
  attempts: AttemptRow[];
  reputation: ReputationRow[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const EMPTY = { agents: [], tasks: [], attempts: [], reputation: [] };

/**
 * One shared live feed of the whole Relay state (md 5). Every dashboard page
 * uses this — a single Supabase Realtime channel, debounced refetch on any
 * insert/update to tasks / task_attempts / reputation_scores.
 */
export function useRelayData(): RelayData {
  const [state, setState] = useState<Omit<RelayData, "loading" | "error" | "refetch">>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [a, t, at, r] = await Promise.all([
      supabase.from("agents").select("*"),
      supabase.from("tasks").select("*").eq("org_slug", RELAY_ORG).order("created_at", { ascending: false }),
      supabase.from("task_attempts").select("*").eq("org_slug", RELAY_ORG).order("created_at"),
      supabase.from("reputation_scores").select("*").eq("org_slug", RELAY_ORG),
    ]);
    const err = a.error || t.error || at.error || r.error;
    if (err) {
      setError(err.message);
    } else {
      setError(null);
      setState({
        agents: (a.data ?? []) as AgentRow[],
        tasks: (t.data ?? []) as TaskRow[],
        attempts: (at.data ?? []) as AttemptRow[],
        reputation: (r.data ?? []) as ReputationRow[],
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 250);
    };
    const ch = supabase
      .channel("relay-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "task_attempts" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "reputation_scores" }, schedule)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  return { ...state, loading, error, refetch: load };
}

export function attemptsByTask(attempts: AttemptRow[]): Map<string, AttemptRow[]> {
  const m = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    const arr = m.get(a.task_id) ?? [];
    arr.push(a);
    m.set(a.task_id, arr);
  }
  return m;
}
