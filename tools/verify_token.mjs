#!/usr/bin/env node
// Deterministic check: does a token verify against an issuer key?
// Usage: node tools/verify_token.mjs <publicKeySPKI> <token>
// Exit 0 = valid, 1 = not valid, 2 = bad usage. Prints JSON.
import { verifyCredential } from "../trust.mjs";

const [publicKey, token] = process.argv.slice(2);
if (!publicKey || !token) {
  console.error("Usage: node tools/verify_token.mjs <publicKeySPKI> <token>");
  process.exit(2);
}
const result = await verifyCredential(token.replace(/^vouch:1:/, ""), publicKey);
console.log(JSON.stringify(result, null, 2));
process.exit(result.valid ? 0 : 1);
