/**
 * Canonical serialisation of the attestation payload (md section 4).
 *
 * The signature must be reproducible byte-for-byte by anyone verifying it, so
 * the bytes that get signed are defined deterministically:
 *   - object keys sorted lexicographically, recursively
 *   - no insignificant whitespace
 *   - arrays keep their order
 *
 * This is a small, dependency-free JCS-style canonicaliser. The payloads Relay
 * signs are flat string/number maps, so this is deliberately minimal rather
 * than a full RFC 8785 implementation.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error(`cannot canonicalize value of type ${typeof value}`);
}

export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
