import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { canonicalBytes } from "./canonical.js";
import { didToPublicKey } from "./did.js";

// @noble/ed25519 v2 needs a sha512 impl wired in for the sync + async paths.
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const b64 = {
  encode: (bytes: Uint8Array) => Buffer.from(bytes).toString("base64"),
  decode: (s: string) => new Uint8Array(Buffer.from(s, "base64")),
};

/**
 * The exact object shape that gets signed for every task attempt (md section 4).
 * Keep this minimal and stable — it is the tamper-evident record.
 */
export interface AttestationPayload {
  agent_did: string;
  task_id: string;
  task_type: string;
  scope_declared: string;
  outcome: "passed" | "failed" | "escalated" | "human_override";
  timestamp: string; // ISO 8601
}

export function signPayload(payload: AttestationPayload, privateKey: Uint8Array): string {
  const sig = ed.sign(canonicalBytes(payload), privateKey);
  return b64.encode(sig);
}

/**
 * Verify a signature against the DID embedded in the payload.
 * Returns false on any tampering (payload field changed, signature changed,
 * wrong key) rather than throwing — the dashboard renders this as ✓ / ✗.
 */
export function verifyPayload(payload: AttestationPayload, signatureB64: string): boolean {
  try {
    const publicKey = didToPublicKey(payload.agent_did);
    return ed.verify(b64.decode(signatureB64), canonicalBytes(payload), publicKey);
  } catch {
    return false;
  }
}

export { b64 };
