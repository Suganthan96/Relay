import { base58 } from "@scure/base";

/**
 * did:key for Ed25519 (md section 4).
 *
 * A did:key is self-certifying: the identifier IS the public key, multicodec-
 * tagged and multibase-encoded. No registry, no chain, no lookup — anyone can
 * pull the verifying key straight out of the string.
 *
 *   did:key:z<base58btc( 0xed 0x01 || rawPublicKey )>
 *
 * 0xed01 is the unsigned-varint multicodec code for "ed25519-pub".
 * The leading "z" is the multibase prefix for base58btc.
 */

const ED25519_PUB_MULTICODEC = Uint8Array.from([0xed, 0x01]);

export function publicKeyToDid(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new Error(`ed25519 public key must be 32 bytes, got ${publicKey.length}`);
  }
  const bytes = new Uint8Array(ED25519_PUB_MULTICODEC.length + publicKey.length);
  bytes.set(ED25519_PUB_MULTICODEC, 0);
  bytes.set(publicKey, ED25519_PUB_MULTICODEC.length);
  return `did:key:z${base58.encode(bytes)}`;
}

export function didToPublicKey(did: string): Uint8Array {
  const prefix = "did:key:z";
  if (!did.startsWith(prefix)) {
    throw new Error(`not a base58btc did:key: ${did}`);
  }
  const bytes = base58.decode(did.slice(prefix.length));
  if (bytes[0] !== 0xed || bytes[1] !== 0x01) {
    throw new Error(`did:key is not ed25519-pub (multicodec ${bytes[0]},${bytes[1]})`);
  }
  const publicKey = bytes.slice(2);
  if (publicKey.length !== 32) {
    throw new Error(`decoded ed25519 public key must be 32 bytes, got ${publicKey.length}`);
  }
  return publicKey;
}

/** The multibase (base58btc) form of the public key, stored in agents.public_key. */
export function publicKeyMultibase(publicKey: Uint8Array): string {
  return `z${base58.encode(publicKey)}`;
}

export function multibaseToPublicKey(mb: string): Uint8Array {
  if (!mb.startsWith("z")) throw new Error(`expected base58btc multibase (z...), got ${mb}`);
  return base58.decode(mb.slice(1));
}
