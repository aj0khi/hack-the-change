import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server-app.mjs';
import { createVerificationStore } from '../verification/verification-store.mjs';
import { createIssuer, signCredential } from '../trust.mjs';
import { projects } from './projects.mjs';

async function start(options) {
  const app = createApp({ config: { appOrigin: 'http://localhost:8766' }, store: createVerificationStore(':memory:'), ...options });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test('serves only the listed static files, including the lens folder', async () => {
  const { server, base } = await start({});
  try {
    for (const path of ['/', '/app.js', '/lens/lens.css', '/lens/projects.mjs', '/lens/skills.mjs', '/lens/student-pathway.mjs', '/lens/job-example.mjs', '/verification/verification-ui.mjs', '/verification/share-card.mjs'])
      assert.equal((await fetch(`${base}${path}`)).status, 200, path);
    for (const path of ['/server.mjs', '/lens/lens.mjs', '/lens/bedrock.mjs', '/.env', '/lens/../.env', '/data/lens-cache.json'])
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    assert.equal((await (await fetch(`${base}/api/config`)).json()).enabled, false);
    assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
    assert.equal((await fetch(`${base}/api/employer/demo-students`)).status, 503);
  } finally { server.close(); }
});
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

test('/api/lens reuses the answer for an identical request and never caches fallbacks', async () => {
  let calls = 0;
  const generate = async () => { calls++; return { requirements: [{ text: 'SQL', kind: 'technical', matches: [] }] }; };
  const { server, base } = await start({ lens: { generate, model: 'mock' } });
  try {
    const body = { posting: 'Needs SQL', credentials: [], issuerPublicKey: 'x' };
    const first = await (await post(base, body)).json();
    const second = await (await post(base, body)).json();
    assert.equal(calls, 1);
    assert.equal(first.cached, undefined);
    assert.equal(second.cached, true);
    await post(base, { ...body, posting: 'Needs Excel' });
    assert.equal(calls, 2);
  } finally { server.close(); }
  let failing = 0;
  const flaky = await start({ lens: { generate: async () => { failing++; throw new Error('503'); }, model: 'mock' } });
  try {
    const body = { posting: 'Needs SQL', credentials: [], issuerPublicKey: 'x' };
    assert.equal((await (await post(flaky.base, body)).json()).fallback, true);
    await post(flaky.base, body);
    assert.equal(failing, 2);
  } finally { flaky.server.close(); }
});

test('/api/lens serves a pre-loaded saved result and reports new ones', async () => {
  const { createHash } = await import('node:crypto');
  const body = { posting: 'Needs SQL', credentials: [], issuerPublicKey: 'x' };
  const key = createHash('sha256').update(JSON.stringify([body.posting, body.credentials, body.issuerPublicKey, projects])).digest('hex');
  const saved = { requirements: [], rejected: [], stats: { total: 0, matched: 0, gaps: 0 }, model: 'saved' };
  let calls = 0;
  let changes = 0;
  const generate = async () => { calls++; return { requirements: [] }; };
  const { server, base } = await start({ lens: { generate, model: 'mock' }, lensCache: new Map([[key, saved]]), onLensCacheChange: () => { changes++; } });
  try {
    const first = await (await post(base, body)).json();
    assert.equal(first.cached, true);
    assert.equal(first.model, 'saved');
    assert.equal(calls, 0);
    await post(base, { ...body, posting: 'Needs Excel' });
    assert.equal(calls, 1);
    assert.equal(changes, 1);
  } finally { server.close(); }
});

test('/api/lens does not reuse results saved before the current project catalog', async () => {
  const { createHash } = await import('node:crypto');
  const body = { posting: 'Needs SQL', credentials: [], issuerPublicKey: 'x' };
  const oldKey = createHash('sha256').update(JSON.stringify([body.posting, body.credentials, body.issuerPublicKey])).digest('hex');
  let calls = 0;
  const generate = async () => { calls++; return { requirements: [] }; };
  const { server, base } = await start({ lens: { generate, model: 'mock' }, lensCache: new Map([[oldKey, { model: 'old' }]]) });
  try {
    const result = await (await post(base, body)).json();
    assert.equal(calls, 1);
    assert.equal(result.model, 'mock');
    assert.equal(result.cached, undefined);
  } finally { server.close(); }
});
