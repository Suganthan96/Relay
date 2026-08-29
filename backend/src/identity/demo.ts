import { newAgentKey } from "./keys.js";
import { signPayload, verifyPayload, type AttestationPayload } from "./signing.js";
import { canonicalize } from "./canonical.js";

/**
 * The 10-second trust story from md section 4, run entirely offline:
 * sign an attempt, verify it (✓), tamper one field, verify again (✗).
 *
 *   npm run demo:sign
 */
const coder = newAgentKey("coder");

const payload: AttestationPayload = {
  agent_did: coder.did,
  task_id: "11111111-2222-3333-4444-555555555555",
  task_type: "css-fix",
  scope_declared: "fix mobile login button CSS",
  outcome: "passed",
  timestamp: "2026-08-27T10:15:00Z",
};

const signature = signPayload(payload, coder.privateKey);

console.log("agent DID :", coder.did);
console.log("canonical :", canonicalize(payload));
console.log("signature :", signature);
console.log("verify    :", verifyPayload(payload, signature) ? "PASS ✓" : "FAIL ✗");

// Tamper: flip the outcome in the record, keep the original signature.
const tampered: AttestationPayload = { ...payload, outcome: "failed" };
console.log("\n-- tamper outcome passed -> failed, reuse signature --");
console.log("verify    :", verifyPayload(tampered, signature) ? "PASS ✓ (BUG)" : "FAIL ✗ (expected)");

process.exit(verifyPayload(payload, signature) && !verifyPayload(tampered, signature) ? 0 : 1);
