#!/usr/bin/env node
// Deterministic fixture: sign a known credential with trust.mjs and print
// { publicKeySPKI, token, tampered } so other platforms (iOS) can test against it.
// Usage: node tools/make_test_vector.mjs > tools/test-vector.json
import { createIssuer, signCredential, alterCredential, verifyCredential } from "../trust.mjs";

const issuer = await createIssuer();
const payload = {
  transcript: "Priya was patient and explained every step clearly.",
  title: "Help neighbours connect online",
  witness: "Doug",
  issuer: "Community Centre (fictional demo)",
  student: "Priya Sharma",
  example: true,
  issuedAt: "2026-11-07",
  mappings: [{ skill: "Communication", quote: "explained every step clearly" }],
};
const token = await signCredential(payload, issuer);
const tampered = alterCredential(token);
if (!(await verifyCredential(token, issuer.publicKey)).valid || (await verifyCredential(tampered, issuer.publicKey)).valid) {
  console.error("Self-check failed: trust.mjs is not behaving as expected.");
  process.exit(1);
}
console.log(JSON.stringify({ publicKeySPKI: issuer.publicKey, token, tampered }, null, 2));
