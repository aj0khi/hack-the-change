import test from 'node:test';
import assert from 'node:assert/strict';
import { createIssuer, signCredential, decodeCredential, importPublicKey, verifySignature, alterCredential, groundedMappings } from './trust.mjs';

test('signatures check out only with the signing key and fail after editing', async () => {
  const issuer = await createIssuer({ issuerId: 'centre-a' });
  const otherIssuer = await createIssuer();
  const payload = { issuerId: 'centre-a', transcript: 'She explained the steps clearly.', mappings: [{ skill: 'Communication', quote: 'explained the steps clearly' }] };
  const token = await signCredential(payload, issuer);
  const decoded = decodeCredential(token);
  assert.deepEqual(decoded.payload, payload);
  assert.deepEqual(decoded.header, { alg: 'EdDSA', typ: 'JWT', kid: 'centre-a' });
  assert.equal(await verifySignature(decoded, await importPublicKey(issuer.publicKey)), true);
  assert.equal(await verifySignature(decodeCredential(alterCredential(token)), await importPublicKey(issuer.publicKey)), false);
  assert.equal(await verifySignature(decoded, await importPublicKey(otherIssuer.publicKey)), false);
  await assert.rejects(signCredential({ ...payload, issuerId: 'centre-b' }, issuer), /must match/);
});

test('refuses fabricated or absent evidence and malformed tokens', async () => {
  const issuer = await createIssuer();
  const mappings = [{ skill: 'Digital', quote: 'invented praise' }];
  assert.deepEqual(groundedMappings('A different transcript', mappings), []);
  await assert.rejects(signCredential({ transcript: 'A different transcript', mappings }, issuer));
  await assert.rejects(signCredential({ transcript: 'A different transcript', mappings: [] }, issuer));
  for (const bad of ['bad.token', 'a.b.c', '', 42, null, 'x'.repeat(20000), 'e30.W10.e30']) assert.equal(decodeCredential(bad), null, String(bad).slice(0, 20));
});
