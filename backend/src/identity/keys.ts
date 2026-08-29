import { readFile } from "node:fs/promises";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { publicKeyToDid, publicKeyMultibase } from "./did.js";
import { b64 } from "./signing.js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export type AgentRole = "planner" | "coder" | "tester" | "reviewer";

export const AGENT_ROLES: AgentRole[] = ["planner", "coder", "tester", "reviewer"];

export const ROLE_NAME: Record<AgentRole, string> = {
  planner: "Planner",
  coder: "Coder",
  tester: "Tester",
  reviewer: "Reviewer",
};

export interface AgentKey {
  role: AgentRole;
  name: string;
  did: string;
  publicKeyMultibase: string;
  privateKey: Uint8Array; // 32 bytes, server-side only (md 4)
  publicKey: Uint8Array;
}

/** On-disk shape written by `npm run keys:gen` (private keys base64, never committed). */
interface StoredKey {
  role: AgentRole;
  did: string;
  public_key: string; // multibase
  private_key_b64: string;
}

export function newAgentKey(role: AgentRole): AgentKey {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);
  return {
    role,
    name: ROLE_NAME[role],
    did: publicKeyToDid(publicKey),
    publicKeyMultibase: publicKeyMultibase(publicKey),
    privateKey,
    publicKey,
  };
}

export function serializeKeys(keys: AgentKey[]): string {
  const stored: StoredKey[] = keys.map((k) => ({
    role: k.role,
    did: k.did,
    public_key: k.publicKeyMultibase,
    private_key_b64: b64.encode(k.privateKey),
  }));
  return JSON.stringify(stored, null, 2);
}

export async function loadAgentKeys(path: string): Promise<Record<AgentRole, AgentKey>> {
  const raw = await readFile(path, "utf8").catch(() => {
    throw new Error(
      `agent keys not found at ${path} — run \`npm run keys:gen\` first (md 4)`,
    );
  });
  const stored = JSON.parse(raw) as StoredKey[];
  const out = {} as Record<AgentRole, AgentKey>;
  for (const s of stored) {
    const privateKey = b64.decode(s.private_key_b64);
    const publicKey = ed.getPublicKey(privateKey);
    out[s.role] = {
      role: s.role,
      name: ROLE_NAME[s.role],
      did: s.did,
      publicKeyMultibase: s.public_key,
      privateKey,
      publicKey,
    };
  }
  for (const role of AGENT_ROLES) {
    if (!out[role]) throw new Error(`agent keys file ${path} is missing role "${role}"`);
  }
  return out;
}
