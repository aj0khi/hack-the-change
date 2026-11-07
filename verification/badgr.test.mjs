import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectBadgrAssertion } from './badgr.mjs';

const id = 'example_123';
const source = `https://api.badges.parchment.ca/public/assertions/${id}`;
const assertion = { id: source, type: 'Assertion', verification: { type: 'HostedBadge' }, badge: { name: 'Example badge' }, issuedOn: '2026-01-01T00:00:00Z' };
const fake = (data, status = 200) => async () => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

test('looks up only supported hosted assertions and reports status without claiming identity verification', async () => {
  const result = await inspectBadgrAssertion({ region: 'canada', assertionId: id }, fake(assertion));
  assert.equal(result.status, 'found');
  assert.equal(result.badgeName, 'Example badge');
  assert.equal(result.source, source);
  assert.equal('verified' in result, false);
  assert.equal((await inspectBadgrAssertion({ region: 'canada', assertionId: id }, fake({ ...assertion, revoked: true }))).status, 'revoked');
  assert.equal((await inspectBadgrAssertion({ region: 'canada', assertionId: id }, fake({ ...assertion, expires: '2020-01-01T00:00:00Z' }))).status, 'expired');
  assert.equal((await inspectBadgrAssertion({ region: 'canada', assertionId: id }, fake({}, 410))).status, 'revoked');
});

test('rejects arbitrary URLs, redirects, malformed records and unknown expiry', async () => {
  await assert.rejects(inspectBadgrAssertion({ region: 'canada', assertionId: '../private' }, fake(assertion)));
  await assert.rejects(inspectBadgrAssertion({ region: 'canada', assertionId: id }, fake({ ...assertion, id: 'https://other.example/assertion' })));
  await assert.rejects(inspectBadgrAssertion({ region: 'canada', assertionId: id }, fake({ ...assertion, verification: { type: 'SignedBadge' } })));
  await assert.rejects(inspectBadgrAssertion({ region: 'canada', assertionId: id }, fake({ ...assertion, expires: 'nonsense' })));
  await assert.rejects(inspectBadgrAssertion({ region: 'canada', assertionId: id }, async (_url, options) => { assert.equal(options.redirect, 'error'); throw new Error('redirect'); }));
});