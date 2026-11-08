// Credential format: compact JWS, EdDSA (Ed25519), header { alg, typ, kid }. The `kid` header and the
// signed `issuerId` claim name the issuer. Shared by the server and the browser.
//
// This module only has low-level helpers. Deciding whether a credential is authentic happens on the server
// in verification/credential-verifier.mjs, which takes the public key from the trusted issuer registry and
// never from a caller.
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const CREDENTIAL_ALG = "EdDSA";
export const CREDENTIAL_TYP = "JWT";
const MAX_TOKEN_LENGTH = 16000;
const COMPACT_JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function encode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function decode(value) {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

// Test helper: a fresh key pair. `issuerId` is what signCredential puts in the `kid` header.
export async function createIssuer({ issuerId } = {}) {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
    "sign",
    "verify",
  ]);
  const publicKey = encode(
    await crypto.subtle.exportKey("spki", keys.publicKey),
  );
  return { issuerId, privateKey: keys.privateKey, publicKey };
}

export function groundedMappings(transcript, mappings) {
  return mappings.filter(
    (mapping) =>
      mapping.skill && mapping.quote && transcript.includes(mapping.quote),
  );
}

// issuer: { privateKey: CryptoKey, issuerId?: string }. With an issuerId, the header gets `kid` and the
// payload must carry the same signed `issuerId`.
export async function signCredential(payload, issuer) {
  if (
    !payload.transcript ||
    !payload.mappings?.length ||
    groundedMappings(payload.transcript, payload.mappings).length !==
      payload.mappings.length
  ) {
    throw new Error(
      "Each skill needs an exact quote from the confirmed transcript.",
    );
  }
  if (issuer.issuerId !== undefined && payload.issuerId !== issuer.issuerId)
    throw new Error("The payload issuerId must match the signing issuer.");
  const headerFields = { alg: CREDENTIAL_ALG, typ: CREDENTIAL_TYP };
  if (issuer.issuerId !== undefined) headerFields.kid = issuer.issuerId;
  const header = encode(encoder.encode(JSON.stringify(headerFields)));
  const body = encode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    "Ed25519",
    issuer.privateKey,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${encode(signature)}`;
}

// Parses a compact JWS WITHOUT checking it. Returns null when it is not well-formed JSON objects.
export function decodeCredential(jws) {
  try {
    if (typeof jws !== "string" || jws.length > MAX_TOKEN_LENGTH || !COMPACT_JWS.test(jws)) return null;
    const [headerPart, payloadPart, signaturePart] = jws.split(".");
    const header = JSON.parse(decoder.decode(decode(headerPart)));
    const payload = JSON.parse(decoder.decode(decode(payloadPart)));
    const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
    if (!isObject(header) || !isObject(payload)) return null;
    return {
      header,
      payload,
      signingInput: encoder.encode(`${headerPart}.${payloadPart}`), // the exact bytes that were signed
      signature: decode(signaturePart),
    };
  } catch {
    return null;
  }
}

export function importPublicKey(spkiBase64url) {
  return crypto.subtle.importKey("spki", decode(spkiBase64url), { name: "Ed25519" }, false, ["verify"]);
}

// Ed25519 only: the algorithm is fixed here, never read from the token.
export async function verifySignature(decoded, publicKey) {
  try {
    return await crypto.subtle.verify("Ed25519", publicKey, decoded.signature, decoded.signingInput);
  } catch {
    return false;
  }
}

// Demo "tamper test": change one signed field so the signature no longer matches.
export function alterCredential(jws) {
  const parts = jws.split(".");
  const payload = JSON.parse(decoder.decode(decode(parts[1])));
  payload.transcript += " (edited)";
  parts[1] = encode(encoder.encode(JSON.stringify(payload)));
  return parts.join(".");
}
