import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './server.mjs';
import { createVerificationStore } from './verification-store.mjs';

test('verification fails closed and never promotes test identities or self-submitted organizations', async () => {
  const store = createVerificationStore(':memory:');
  const sessions = new Map();
  const stripe = { identity: { verificationSessions: {
    async create(options) {
      const session = { id: 'vs_test', url: 'https://verify.stripe.com/test', status: 'requires_input', type: 'document', livemode: false, client_reference_id: options.client_reference_id, options: { document: { require_matching_selfie: true } } };
      sessions.set(session.id, session);
      return session;
    },
    async retrieve(id) { return sessions.get(id); },
  } } };
  const authenticate = (request, response, next) => {
    const token = request.get('authorization')?.replace('Bearer ', '');
    if (!token) return response.status(401).json({ error: 'Sign in.' });
    request.auth = { token, payload: { sub: token } };
    next();
  };
  const getUserInfo = async token => ({ sub: token, email: `${token}@example.org`, email_verified: token !== 'unverified' });
  const app = createApp({ config: { appOrigin: 'http://localhost:8766' }, store, authenticate, getUserInfo, stripe });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token, body) => fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.equal((await request('/api/account')).status, 401);
    assert.equal((await request('/api/account', 'unverified')).status, 403);
    assert.equal(store.account('unverified').email_verified, 0);
    assert.equal((await request('/api/account', 'alice')).status, 200);
    const created = await request('/api/account/identity', 'alice', {});
    assert.equal(created.status, 200);
    assert.equal((await created.json()).url, 'https://verify.stripe.com/test');
    const needsInput = await request('/api/account/identity/refresh', 'alice', {});
    assert.equal((await needsInput.json()).identityStatus, 'needs_input');
    assert.equal((await request('/api/account/identity', 'alice', {})).status, 200);
    sessions.get('vs_test').options.document.require_matching_selfie = false;
    assert.equal((await request('/api/account/identity', 'alice', {})).status, 403);
    sessions.get('vs_test').options.document.require_matching_selfie = true;
    sessions.get('vs_test').status = 'verified';
    const refresh = await request('/api/account/identity/refresh', 'alice', {});
    const status = await refresh.json();
    assert.equal(status.identityStatus, 'test_verified');
    assert.equal(status.uniquenessStatus, 'pending');
    sessions.get('vs_test').options.document.require_matching_selfie = false;
    assert.equal((await request('/api/account/identity/refresh', 'alice', {})).status, 403);
    sessions.get('vs_test').options.document.require_matching_selfie = true;
    const organization = await request('/api/account/organization', 'alice', { name: 'Example Org', registry: '12345', website: 'https://example.org', email: 'contact@example.org', phone: '403-555-0100' });
    const details = await organization.json();
    assert.equal(organization.status, 202);
    assert.equal(details.organization.status, 'pending');
    assert.equal(details.organization.contactStatus, 'pending');
    assert.equal(details.organization.registryStatus, 'pending');
    assert.equal(details.organization.membershipStatus, 'pending');
    assert.equal((await request('/api/account/identity/refresh', 'bob', {})).status, 409);
    sessions.get('vs_test').client_reference_id = 'someone-else';
    assert.equal((await request('/api/account/identity/refresh', 'alice', {})).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
});

test('Badgr lookup exposes only provider status and rejects unsafe identifiers', async () => {
  const store = createVerificationStore(':memory:');
  const badgeFetcher = async url => new Response(JSON.stringify({ id: url, type: 'Assertion', verification: { type: 'HostedBadge' } }), { headers: { 'content-type': 'application/json' } });
  const app = createApp({ config: {}, store, authenticate: null, getUserInfo: null, stripe: null, badgeFetcher });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}/api/badgr/assertion`;
  const request = body => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const good = await request({ region: 'canada', assertionId: 'badge-123' });
    assert.equal(good.status, 200);
    const result = await good.json();
    assert.equal(result.status, 'found');
    assert.equal('verified' in result, false);
    assert.equal((await request({ region: 'canada', assertionId: '../private' })).status, 422);
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
});

test('identity attempts are reserved atomically and limited per account', () => {
  const store = createVerificationStore(':memory:');
  try {
    store.upsertAccount('user', 'user@example.org', true);
    const now = Date.now();
    assert.equal(store.reserveIdentity('user', now), true);
    assert.equal(store.reserveIdentity('user', now), false);
    store.failIdentityStart('user');
    assert.equal(store.reserveIdentity('user', now + 1), true);
    store.failIdentityStart('user');
    assert.equal(store.reserveIdentity('user', now + 2), true);
    store.failIdentityStart('user');
    assert.equal(store.reserveIdentity('user', now + 3), false);
    assert.equal(store.reserveIdentity('user', now + 86400001), true);
  } finally { store.close(); }
});

test('unconfigured authentication is unavailable', async () => {
  const store = createVerificationStore(':memory:');
  const app = createApp({ config: {}, store, authenticate: null, getUserInfo: null, stripe: null });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/account`);
    assert.equal(response.status, 503);
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
  }
});