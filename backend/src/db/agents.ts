import { db } from "./client.js";
import { AGENT_ROLES, type AgentRole } from "../identity/keys.js";
import type { AgentRow } from "./types.js";

/** Fetch the four agent rows keyed by role (md 4, 5). */
export async function loadAgents(): Promise<Record<AgentRole, AgentRow>> {
  const { data, error } = await db().from("agents").select("*");
  if (error) throw new Error(`loadAgents failed: ${error.message}`);

  const byRole = {} as Record<AgentRole, AgentRow>;
  for (const row of data as AgentRow[]) byRole[row.role] = row;

  for (const role of AGENT_ROLES) {
    if (!byRole[role]) {
      throw new Error(`agents table is missing role "${role}" — run the seed migration`);
    }
  }
  return byRole;
}
