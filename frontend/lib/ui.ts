import type { Outcome } from "./types";

export const OUTCOME_COLOR: Record<Outcome, string> = {
  passed: "#0175ff",
  escalated: "#ffac0a",
  failed: "#ff2244",
  human_override: "#ffcd7d",
};

export const STATUS_COLOR: Record<string, string> = {
  open: "#9ba9c4",
  planning: "#9ba9c4",
  coding: "#0175ff",
  testing: "#0175ff",
  reviewing: "#ffac0a",
  pr_opened: "#0175ff",
  merged: "#3ddc84",
  rejected: "#ff2244",
  escalated: "#ffac0a",
  failed: "#ff2244",
};

export function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
