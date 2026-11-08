// The ONE function that decides whether a credential is authentic. Every server entry point (Employer
// lens, /verify/:id, the public verify API, sharing) calls the verifier created here, so they all agree.
//
// Rule: a credential is verified only if it carries a valid Ed25519 signature from an issuer in the
// server-side trusted registry, its signed claims are complete and consistent, and that issuer's records
// show it issued this exact credential. Any failure, including an unavailable records check, rejects it
// (fail closed).
import { CREDENTIAL_ALG, CREDENTIAL_TYP, decodeCredential, groundedMappings, verifySignature } from "../trust.mjs";
import { skillTerms } from "../lens/skills.mjs";

const ALLOWED_HEADER_FIELDS = new Set(["alg", "typ", "kid"]); // no jwk/jku/x5c/crit: keys never come from the token
const CREDENTIAL_ID = /^[A-Za-z0-9_-]{16,64}$/;
const ISSUED_AT = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/;

const MESSAGES = {
  verified: "Credential successfully verified.",
  malformed: "Credential verification failed: the credential is malformed.",
  untrusted_issuer: "Credential verification failed: it is not from an organization this server trusts.",
  bad_signature: "Credential verification failed: the signature does not match a trusted issuer.",
  missing_claims: "Credential verification failed: required information is missing or inconsistent.",
  expired: "Credential verification failed: the credential has expired.",
  unknown_credential: "Credential verification failed: the issuer has no record of this credential.",
  unavailable: "Credential verification failed: the issuer's records could not be checked. Try again later.",
};

const fail = (reason) => ({ valid: false, status: "invalid", reason, message: MESSAGES[reason] });

function hasRequiredClaims(payload) {
  const text = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
  return (
    CREDENTIAL_ID.test(payload.credentialId ?? "") &&
    text(payload.title, 150) &&
    text(payload.witness, 40) &&
    text(payload.transcript, 2000) &&
    text(payload.student, 100) &&
    typeof payload.issuedAt === "string" && ISSUED_AT.test(payload.issuedAt) &&
    Array.isArray(payload.mappings) && payload.mappings.length >= 1 && payload.mappings.length <= 9 &&
    payload.mappings.every((m) => m && Object.hasOwn(skillTerms, m.skill) && typeof m.quote === "string") &&
    groundedMappings(payload.transcript, payload.mappings).length === payload.mappings.length &&
    (payload.exp === undefined || Number.isInteger(payload.exp))
  );
}

/**
 * issuers: Map from loadTrustedIssuers() — the only source of public keys and organization names.
 * isIssued: async (issuerId, credentialId, token) => boolean, from the issuer's own records: did it issue
 *   this exact credential? Throwing counts as "unavailable" and fails verification.
 * now: () => milliseconds, for testing expiry.
 */
export function createCredentialVerifier({ issuers, isIssued, now = () => Date.now() }) {
  if (!(issuers instanceof Map) || !issuers.size) throw new Error("A trusted issuer registry is required.");
  if (typeof isIssued !== "function") throw new Error("An issuance records lookup is required.");

  return async function verifyCredential(token) {
    // 1. Structure. Nothing here is trusted yet.
    const decoded = decodeCredential(token);
    if (!decoded) return fail("malformed");
    const { header, payload } = decoded;
    if (Object.keys(header).some((field) => !ALLOWED_HEADER_FIELDS.has(field))) return fail("malformed");
    // 2. Algorithm pinned: no "none", no HMAC, no substitution.
    if (header.alg !== CREDENTIAL_ALG || header.typ !== CREDENTIAL_TYP) return fail("malformed");

    // 3. Issuer: named in the signed payload, matched by the (also signed) header `kid`.
    const issuerId = payload.issuerId;
    if (typeof issuerId !== "string" || header.kid !== issuerId) return fail("missing_claims");
    const issuer = issuers.get(issuerId);
    if (!issuer) return fail("untrusted_issuer");

    // 4. Signature, over the exact received bytes, with the REGISTERED key for that issuer.
    if (!(await verifySignature(decoded, issuer.key))) return fail("bad_signature");

    // 5. Claims.
    if (!hasRequiredClaims(payload)) return fail("missing_claims");
    if (payload.exp !== undefined && payload.exp * 1000 <= now()) return fail("expired");

    // 6. Issuance record, failing closed.
    let issued;
    try {
      issued = await isIssued(issuerId, payload.credentialId, token);
    } catch {
      return fail("unavailable");
    }
    if (issued !== true) return fail("unknown_credential");

    // The organization name always comes from the registry; any name inside the credential is ignored.
    const credential = { ...payload, issuer: issuer.name };
    delete credential.issuerName;
    return { valid: true, status: "verified", message: MESSAGES.verified, issuerId, issuerName: issuer.name, credentialId: payload.credentialId, credential };
  };
}

// What the public API returns: no tokens, keys or internal details.
export function publicResult(result) {
  const { valid, status, reason, message, issuerId, issuerName, credentialId, credential } = result;
  return { valid, status, reason, message, issuerId, issuerName, credentialId, credential };
}
