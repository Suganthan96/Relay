"use client";

import { Shell } from "@/components/dashboard/Shell";
import { TrustGraph } from "@/components/dashboard/TrustGraph";

export default function GraphPage() {
  return (
    <Shell
      title="Live trust graph"
      subtitle="Nodes are signed task attempts, edges are agent handoffs. Subscribed to Supabase Realtime — new nodes appear the instant a row is written. The badge re-checks each Ed25519 signature against the agent's DID in your browser; select a node to see its scope and tamper it."
    >
      <TrustGraph />
    </Shell>
  );
}
