import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { base58 } from "@scure/base";
import type { AttemptRow } from "./types";

// wire sha512 for the sync path (mirrors the backend)
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

/** did:key:z6Mk...  ->  raw 32-byte ed25519 public key (ed25519-pub multicodec 0xed01) */
function didToPublicKey(did: string): Uint8Array {
  const prefix = "did:key:z";
  if (!did.startsWith(prefix)) throw new Error("not a base58btc did:key");
  const bytes = base58.decode(did.slice(prefix.length));
  if (bytes[0] !== 0xed || bytes[1] !== 0x01) throw new Error("did:key is not ed25519-pub");
  return bytes.slice(2);
}

/** Deterministic JSON — sorted keys, no whitespace — identical to the backend signer. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error(`cannot canonicalize ${typeof value}`);
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface Verification {
  ok: boolean;
  signatureValid: boolean;
  consistent: boolean;
  mismatch: string[];
}

interface SignedPayload {
  agent_did: string;
  outcome: string;
  scope_declared: string;
  [k: string]: unknown;
}

/**
 * Re-verify an attempt row in the browser (md 4):
 *   - signatureValid: Ed25519 signature checks out against the DID in the payload
 *   - consistent:     the rendered columns still match what was signed
 * The demo "tamper" button edits `outcome` in the DB — signatureValid stays true,
 * `consistent` flips to false, badge goes ✓ -> ✗.
 */
export function verifyAttempt(row: Pick<AttemptRow, "payload" | "signature" | "outcome" | "scope_declared">): Verification {
  const payload = row.payload as unknown as SignedPayload;
  let signatureValid = false;
  try {
    signatureValid = ed.verify(
      b64ToBytes(row.signature),
      new TextEncoder().encode(canonicalize(payload)),
      didToPublicKey(payload.agent_did),
    );
  } catch {
    signatureValid = false;
  }

  const mismatch: string[] = [];
  if (payload.outcome !== row.outcome) {
    mismatch.push(`outcome: signed "${payload.outcome}" vs row "${row.outcome}"`);
  }
  if (row.scope_declared != null && payload.scope_declared !== row.scope_declared) {
    mismatch.push(`scope_declared changed`);
  }
  const consistent = mismatch.length === 0;
  return { ok: signatureValid && consistent, signatureValid, consistent, mismatch };
}
