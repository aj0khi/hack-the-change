import test from 'node:test';
import assert from 'node:assert/strict';
import { createIssuer, signCredential, verifyCredential, alterCredential, groundedMappings } from './trust.mjs';

test('signed evidence verifies only with the trusted issuer and fails after editing', async () => {
  const issuer = await createIssuer();
  const otherIssuer = await createIssuer();
  const payload = { transcript: 'She explained the steps clearly.', mappings: [{ skill: 'Communication', quote: 'explained the steps clearly' }] };
  const token = await signCredential(payload, issuer);
  assert.deepEqual((await verifyCredential(token, issuer.publicKey)).payload, payload);
  assert.equal((await verifyCredential(alterCredential(token), issuer.publicKey)).valid, false);
  assert.equal((await verifyCredential(token, otherIssuer.publicKey)).valid, false);
});

test('refuses fabricated or absent evidence and malformed tokens', async () => {
  const issuer = await createIssuer();
  const mappings = [{ skill: 'Digital', quote: 'invented praise' }];
  assert.deepEqual(groundedMappings('A different transcript', mappings), []);
  await assert.rejects(signCredential({ transcript: 'A different transcript', mappings }, issuer));
  await assert.rejects(signCredential({ transcript: 'A different transcript', mappings: [] }, issuer));
  assert.equal((await verifyCredential('bad.token', issuer.publicKey)).valid, false);
});