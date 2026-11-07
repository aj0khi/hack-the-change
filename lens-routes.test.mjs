import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './server.mjs';
import { createVerificationStore } from './verification-store.mjs';
import { createIssuer, signCredential } from './trust.mjs';

async function start(options) {
  const app = createApp({ config: { appOrigin: 'http://localhost:8766' }, store: createVerificationStore(':memory:'), ...options });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const post = (base, body) => fetch(`${base}/api/lens`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('/api/lens accepts a full-size posting and returns grounded results', async () => {
  const issuer = await createIssuer();
  const transcript = 'She showed me how to call my family and wrote the steps down for me.';
  const token = await signCredential({ title: 'Video calls', witness: 'Doug', issuer: 'Centre', transcript, mappings: [{ skill: 'Digital', quote: transcript }] }, issuer);
  const generate = async () => ({ requirements: [
    { text: 'Write clear instructions', kind: 'soft', matches: [{ credentialId: '0', quote: 'wrote the steps down for me', evidenceType: 'action', why: 'x' }] },
    { text: 'Leadership', kind: 'soft', matches: [{ credentialId: '0', quote: 'a born leader', evidenceType: 'praise', why: 'x' }] },
  ] });
  const { server, base } = await start({ lens: { generate, model: 'mock' } });
  try {
    const response = await post(base, { posting: 'Write clear instructions. '.repeat(500), credentials: [token], issuerPublicKey: issuer.publicKey });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.stats.matched, 1);
    assert.equal(body.stats.droppedByGrounding, 1);
    assert.equal(body.model, 'mock');
  } finally { server.close(); }
});

test('/api/lens falls back without a model and /api/jobs serves the snapshot', async () => {
  const snapshot = { jobs: [{ id: '1', title: 'IT Support' }], fetchedAt: '2026-11-07T00:00:00Z', source: 'cache' };
  const { server, base } = await start({ getJobs: async () => snapshot });
  try {
    const lens = await (await post(base, { posting: 'Needs SQL', credentials: [], issuerPublicKey: 'x' })).json();
    assert.equal(lens.fallback, true);
    assert.deepEqual(await (await fetch(`${base}/api/jobs`)).json(), snapshot);
  } finally { server.close(); }
});
