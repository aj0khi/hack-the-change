import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server-app.mjs';
import { createVerificationStore } from './verification-store.mjs';
import { createDemoCredentialStore } from './demo-credentials.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const fields = {
  title: 'Fictional support', student: 'Alex Example', witness: 'Morgan',
  transcript: 'Alex explained the steps.',
  mappings: [{ skill: 'Communication', quote: 'Alex explained the steps.' }],
};

test('authenticated rehearsal requires three distinct verified accounts and issues only a fictional demo credential', async () => {
  const store = createVerificationStore(':memory:');
  const demoCredentials = await createDemoCredentialStore(':memory:');
  const authenticate = (request, response, next) => {
    const token = request.get('authorization')?.replace('Bearer ', '');
    if (!token) return response.status(401).json({ error: 'Sign in.' });
    request.auth = { token, payload: { sub: token } };
    next();
  };
  const getUserInfo = async token => ({
    sub: token,
    email: token === 'same-email' ? 'witness@example.org' : `${token}@example.org`,
    email_verified: token !== 'unverified',
  });
  const app = createApp({ config: { appOrigin: 'https://proofly.example' }, store, demoCredentials, authenticate, getUserInfo });
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, user, body) => fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(user ? { authorization: `Bearer ${user}` } : {}), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const endpoint = '/api/account/rehearsals';
  try {
    assert.equal((await request(endpoint, null, fields)).status, 401);
    assert.equal((await request(endpoint, 'unverified', fields)).status, 403);
    assert.equal((await request(endpoint, 'witness', { ...fields, mappings: [{ skill: 'Digital', quote: 'invented' }] })).status, 400);
    const created = await request(endpoint, 'witness', fields);
    assert.equal(created.status, 201);
    const { id, code: studentCode } = await created.json();
    assert.equal((await request(`${endpoint}/inspect`, 'witness', { role: 'student', code: studentCode })).status, 400);
    assert.equal((await request(`${endpoint}/accept`, 'same-email', { code: studentCode })).status, 400);
    const inspected = await request(`${endpoint}/inspect`, 'student', { role: 'student', code: studentCode });
    assert.equal(inspected.status, 200);
    assert.equal((await inspected.json()).fields.transcript, fields.transcript);
    const accepted = await request(`${endpoint}/accept`, 'student', { code: studentCode });
    assert.equal(accepted.status, 200);
    const { code: coordinatorCode } = await accepted.json();
    assert.equal((await request(`${endpoint}/accept`, 'other', { code: studentCode })).status, 400);
    assert.equal((await request(`${endpoint}/issue`, 'student', { code: coordinatorCode })).status, 400);
    assert.equal((await request(`${endpoint}/inspect`, 'witness', { role: 'coordinator', code: coordinatorCode })).status, 400);
    assert.equal((await request(`${endpoint}/inspect`, 'coordinator', { role: 'coordinator', code: coordinatorCode })).status, 200);
    const simultaneous = await Promise.all([
      request(`${endpoint}/issue`, 'coordinator', { code: coordinatorCode }),
      request(`${endpoint}/issue`, 'coordinator', { code: coordinatorCode }),
    ]);
    assert.deepEqual(simultaneous.map(result => result.status).sort(), [200, 400]);
    const issued = simultaneous.find(result => result.status === 200);
    assert.deepEqual(await issued.json(), { id, status: 'issued' });
    assert.equal((await request(`${endpoint}/issue`, 'another', { code: coordinatorCode })).status, 400);
    const studentList = await (await request(endpoint, 'student')).json();
    assert.equal(studentList.rehearsals[0].status, 'issued');
    const token = studentList.rehearsals[0].token;
    const verification = await demoCredentials.verify(token);
    assert.equal(verification.status, 'verified');
    assert.match(verification.issuerName, /fictional demo/i);
    assert.equal(verification.credential.transcript, fields.transcript);
    assert.equal((await (await request(endpoint, 'witness')).json()).rehearsals[0].token, undefined);
    assert.equal((await (await request(endpoint, 'coordinator')).json()).rehearsals[0].token, undefined);
    assert.equal((await (await request(endpoint, 'other')).json()).rehearsals.length, 0);
    const share = await request('/api/demo-credentials/share', null, { token });
    assert.equal(share.status, 200);
    const sharedUrl = (await share.json()).url;
    const page = await fetch(base + new URL(sharedUrl).pathname);
    assert.match(await page.text(), /Fictional demo only/);
  } finally {
    await new Promise(resolve => server.close(resolve));
    demoCredentials.close();
    store.close();
  }
});

test('rehearsal requests and hashed invitations survive a store restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'proofly-rehearsal-'));
  const filename = join(dir, 'accounts.sqlite');
  let store;
  try {
    store = createVerificationStore(filename);
    store.upsertAccount('witness', 'witness@example.org', true);
    store.upsertAccount('student', 'student@example.org', true);
    const created = store.createRehearsal('witness', fields);
    store.close();
    store = null;
    const db = new DatabaseSync(filename);
    const saved = db.prepare('SELECT invite_hash FROM rehearsal_vouches WHERE id=?').get(created.id);
    db.close();
    assert.match(saved.invite_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(saved.invite_hash, created.code);
    store = createVerificationStore(filename);
    assert.equal(store.listRehearsals('witness')[0].status, 'awaiting_student');
    assert.ok(store.acceptRehearsal('student', created.code));
  } finally {
    store?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('rehearsal invitations expire, are one-time, and recheck verified accounts at issuance', () => {
  const store = createVerificationStore(':memory:');
  try {
    for (const user of ['witness', 'student', 'coordinator']) store.upsertAccount(user, `${user}@example.org`, true);
    const start = 1_000_000;
    const expired = store.createRehearsal('witness', fields, start);
    assert.equal(store.acceptRehearsal('student', expired.code, start + 24 * 60 * 60 * 1000), null);
    const created = store.createRehearsal('witness', fields, start);
    const accepted = store.acceptRehearsal('student', created.code, start + 1);
    assert.ok(accepted);
    assert.equal(store.acceptRehearsal('student', created.code, start + 2), null);
    store.upsertAccount('student', 'student@example.org', false);
    assert.equal(store.reserveRehearsal('coordinator', accepted.code, start + 3), null);
    store.upsertAccount('student', 'student@example.org', true);
    const reservation = store.reserveRehearsal('coordinator', accepted.code, start + 4);
    assert.ok(reservation);
    assert.equal(store.reserveRehearsal('coordinator', accepted.code, start + 5), null);
    store.upsertAccount('student', 'student@example.org', false);
    assert.equal(store.completeRehearsal(created.id, 'coordinator', 'token', start + 6), false);
    store.releaseRehearsal(created.id, 'coordinator', start + 7);
    store.upsertAccount('student', 'student@example.org', true);
    assert.ok(store.reserveRehearsal('coordinator', accepted.code, start + 8));
    assert.equal(store.completeRehearsal(created.id, 'coordinator', 'token', start + 9), true);
    assert.equal(store.reserveRehearsal('coordinator', accepted.code, start + 10), null);
  } finally {
    store.close();
  }
});
