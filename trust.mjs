const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decode(value) {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export async function createIssuer() {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, false, [
    "sign",
    "verify",
  ]);
  const publicKey = encode(
    await crypto.subtle.exportKey("spki", keys.publicKey),
  );
  return { privateKey: keys.privateKey, publicKey };
}

export function groundedMappings(transcript, mappings) {
  return mappings.filter(
    (mapping) =>
      mapping.skill && mapping.quote && transcript.includes(mapping.quote),
  );
}

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
  const header = encode(
    encoder.encode(JSON.stringify({ alg: "EdDSA", typ: "JWT" })),
  );
  const body = encode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    "Ed25519",
    issuer.privateKey,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${encode(signature)}`;
}

export async function verifyCredential(jws, trustedPublicKey) {
  try {
    const parts = jws.split(".");
    if (parts.length !== 3) return { valid: false };
    const header = JSON.parse(decoder.decode(decode(parts[0])));
    if (header.alg !== "EdDSA" || header.typ !== "JWT") return { valid: false };
    const publicKey = await crypto.subtle.importKey(
      "spki",
      decode(trustedPublicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "Ed25519",
      publicKey,
      decode(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return { valid: false };
    const payload = JSON.parse(decoder.decode(decode(parts[1])));
    if (
      !Array.isArray(payload.mappings) ||
      !payload.mappings.length ||
      groundedMappings(payload.transcript, payload.mappings).length !==
        payload.mappings.length
    )
      return { valid: false };
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

export function alterCredential(jws) {
  const parts = jws.split(".");
  const payload = JSON.parse(decoder.decode(decode(parts[1])));
  payload.transcript += " (edited)";
  parts[1] = encode(encoder.encode(JSON.stringify(payload)));
  return parts.join(".");
}
