// Server-side trusted issuer registry: the ONLY place credential verification gets public keys from.
// It is built once at startup from server configuration. No request can add to it or change it, and a
// public key sent by a client is never used.
import { decode, importPublicKey } from "../trust.mjs";

// The demo issuer. Its key pair comes from DEMO_ISSUER_PRIVATE_KEY / DEMO_ISSUER_PUBLIC_KEY, or, when both
// are unset, from the key the server generated and stored in DEMO_CREDENTIAL_DB (see demo-credentials.mjs).
export const DEMO_ISSUER = Object.freeze({
  issuerId: "proofly-demo-centre",
  name: "Community Centre (fictional demo)",
});

const ISSUER_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ED25519_SPKI_BYTES = 44; // DER SubjectPublicKeyInfo for a 32-byte Ed25519 key

export class TrustedIssuerConfigError extends Error {}

// entries: [{ issuerId, name, publicKey }] with publicKey as base64url DER SPKI (Ed25519).
// Throws on any missing or malformed entry, so the server refuses to start instead of trusting less safely.
export async function loadTrustedIssuers(entries) {
  if (!Array.isArray(entries) || !entries.length) throw new TrustedIssuerConfigError("No trusted issuers are configured.");
  const registry = new Map();
  for (const entry of entries) {
    const issuerId = entry?.issuerId;
    if (typeof issuerId !== "string" || !ISSUER_ID.test(issuerId))
      throw new TrustedIssuerConfigError("Each trusted issuer needs an issuerId of lowercase letters, digits and dashes.");
    if (registry.has(issuerId)) throw new TrustedIssuerConfigError(`Trusted issuer "${issuerId}" is listed twice.`);
    if (typeof entry.name !== "string" || !entry.name.trim())
      throw new TrustedIssuerConfigError(`Trusted issuer "${issuerId}" needs a display name.`);
    const publicKey = entry.publicKey;
    if (typeof publicKey !== "string" || !publicKey)
      throw new TrustedIssuerConfigError(`Trusted issuer "${issuerId}" has no public key configured.`);
    let key;
    try {
      if (!BASE64URL.test(publicKey) || decode(publicKey).length !== ED25519_SPKI_BYTES) throw new Error("bad length");
      key = await importPublicKey(publicKey);
    } catch {
      throw new TrustedIssuerConfigError(`Trusted issuer "${issuerId}" has a public key that is not a base64url Ed25519 SPKI key.`);
    }
    registry.set(issuerId, Object.freeze({ issuerId, name: entry.name.trim(), key, publicKey }));
  }
  return registry; // callers get read-only entries; nothing exposes a way to add to it at runtime
}
