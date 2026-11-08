// Security tests for the trusted issuer allowlist. Rule under test: a credential is verified only if it has
// a valid signature from an issuer registered on the server; the client can never choose the key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server-app.mjs';
import { createVerificationStore } from './verification-store.mjs';
import { createDemoCredentialStore } from './demo-credentials.mjs';
import { createCredentialVerifier } from './credential-verifier.mjs';
import { loadTrustedIssuers, DEMO_ISSUER } from './trusted-issuers.mjs';
import { createIssuer, signCredential, encode, decode } from '../trust.mjs';

const transcript = 'Priya explained each step and stayed patient.';
const vouch = { title: 'Help neighbours connect online', witness: 'Doug', transcript, mappings: [{ skill: 'Communication', quote: transcript }] };
const claims = (overrides = {}) => ({
  credentialId: 'test-credential-000001', issuerId: 'centre-a', title: 'Video calls', witness: 'Doug', student: 'Priya Sharma',
  issuedAt: '2026-11-07', transcript, mappings: [{ skill: 'Communication', quote: transcript }], ...overrides,
});

async function startServer() {
  const demoCredentials = await createDemoCredentialStore(':memory:');
  // Mock model: cites the first credential's transcript, so a verified credential produces exactly one match.
  const generate = async () => ({ requirements: [{ text: 'Explain steps clearly', kind: 'soft', matches: [{ credentialId: '0', quote: 'explained each step', evidenceType: 'action', why: 'x' }] }] });
  const app = createApp({ config: { appOrigin: 'https://proofly.example' }, store: createVerificationStore(':memory:'), demoCredentials, lens: { generate, model: 'mock' } });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const verifyApi = async (token, extra = {}) => {
    const response = await post('/api/credentials/verify', { credentials: [token], ...extra });
    return { status: response.status, body: await response.json() };
  };
  return { server, base, post, verifyApi, demoCredentials, close: () => { server.close(); demoCredentials.close(); } };
}

// Two registered issuers (A and B), each with its own key, with every credential treated as "issued".
async function twoIssuerVerifier(isIssued = () => true) {
  const a = await createIssuer({ issuerId: 'centre-a' });
  const b = await createIssuer({ issuerId: 'centre-b' });
  const issuers = await loadTrustedIssuers([
    { issuerId: 'centre-a', name: 'Centre A (registry name)', publicKey: a.publicKey },
    { issuerId: 'centre-b', name: 'Centre B (registry name)', publicKey: b.publicKey },
  ]);
  return { a, b, verify: createCredentialVerifier({ issuers, isIssued }) };
}

// Re-sign with a chosen header, for header-injection cases.
async function signWithHeader(header, payload, privateKey) {
  const enc = new TextEncoder();
  const input = `${encode(enc.encode(JSON.stringify(header)))}.${encode(enc.encode(JSON.stringify(payload)))}`;
  return `${input}.${encode(await crypto.subtle.sign('Ed25519', privateKey, enc.encode(input)))}`;
}

test('1. forged credential signed with an attacker key is rejected, even when the attacker sends their key', async () => {
  const app = await startServer();
  try {
    const attacker = await createIssuer({ issuerId: DEMO_ISSUER.issuerId }); // claims to be the trusted demo issuer
    const forged = await signCredential(claims({ issuerId: DEMO_ISSUER.issuerId }), attacker);
    const plain = await app.verifyApi(forged);
    assert.equal(plain.status, 200);
    assert.equal(plain.body.results[0].valid, false);
    assert.equal(plain.body.results[0].reason, 'bad_signature');
    const withKey = await app.verifyApi(forged, { issuerPublicKey: attacker.publicKey });
    assert.equal(withKey.status, 400);
    assert.match(withKey.body.error, /not accepted/);
    assert.equal(withKey.body.results, undefined);
    // Employer lens: the forged credential gives no evidence.
    const lens = await (await app.post('/api/lens', { posting: 'Explain steps clearly', credentials: [forged] })).json();
    assert.equal(lens.stats.validCredentials, 0);
    assert.equal(lens.stats.matched, 0);
    // And it cannot be published as a share link.
    assert.equal((await app.post('/api/demo-credentials/share', { token: forged })).status, 400);
  } finally { app.close(); }
});

test('2. a credential claiming issuer A but signed with issuer B\'s key is rejected', async () => {
  const { b, verify } = await twoIssuerVerifier();
  const impostor = { ...b, issuerId: 'centre-a' }; // B's private key, A's identity
  const token = await signCredential(claims({ issuerId: 'centre-a' }), impostor);
  const result = await verify(token);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'bad_signature');
  // kid and payload issuer must also agree.
  const mismatch = await signWithHeader({ alg: 'EdDSA', typ: 'JWT', kid: 'centre-b' }, claims({ issuerId: 'centre-a' }), b.privateKey);
  assert.equal((await verify(mismatch)).reason, 'missing_claims');
});

test('3. a correctly signed credential from an unregistered issuer is rejected', async () => {
  const { verify } = await twoIssuerVerifier();
  const stranger = await createIssuer({ issuerId: 'not-registered' });
  const result = await verify(await signCredential(claims({ issuerId: 'not-registered' }), stranger));
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'untrusted_issuer');
});

test('4. a credential from a registered issuer is accepted, with the name from the registry', async () => {
  const { a, verify } = await twoIssuerVerifier();
  const result = await verify(await signCredential(claims({ issuerName: 'Fake Organization', issuer: 'Fake Organization' }), a));
  assert.equal(result.valid, true);
  assert.equal(result.status, 'verified');
  assert.equal(result.issuerId, 'centre-a');
  assert.equal(result.issuerName, 'Centre A (registry name)');
  assert.equal(result.credential.issuer, 'Centre A (registry name)');
  assert.equal(result.credential.issuerName, undefined);
  // End to end through the server's own demo issuer.
  const app = await startServer();
  try {
    const { token } = await (await app.post('/api/demo-credentials/issue', { ...vouch, issuer: 'Fake Organization' })).json();
    const [checked] = (await app.verifyApi(token)).body.results;
    assert.equal(checked.status, 'verified');
    assert.equal(checked.issuerName, DEMO_ISSUER.name);
  } finally { app.close(); }
});

test('5. changing any signed field invalidates the credential', async () => {
  const app = await startServer();
  try {
    const { token } = await (await app.post('/api/demo-credentials/issue', vouch)).json();
    const [header, body, signature] = token.split('.');
    const payload = JSON.parse(new TextDecoder().decode(decode(body)));
    const edits = [
      { mappings: [{ skill: 'Digital', quote: transcript }] },
      { student: 'Someone Else' },
      { issuerId: 'centre-a' },
      { title: 'Lead a team of 50' },
    ];
    for (const edit of edits) {
      const tampered = `${header}.${encode(new TextEncoder().encode(JSON.stringify({ ...payload, ...edit })))}.${signature}`;
      assert.equal((await app.verifyApi(tampered)).body.results[0].valid, false, JSON.stringify(edit));
    }
  } finally { app.close(); }
  // The signature alone catches it, even when the issuer's records would say "issued".
  const { a, verify } = await twoIssuerVerifier();
  const [header, body, signature] = (await signCredential(claims(), a)).split('.');
  const payload = JSON.parse(new TextDecoder().decode(decode(body)));
  const edited = `${header}.${encode(new TextEncoder().encode(JSON.stringify({ ...payload, student: 'Someone Else' })))}.${signature}`;
  assert.equal((await verify(edited)).reason, 'bad_signature');
});

test('6. a client-supplied issuerPublicKey is refused and never used', async () => {
  const app = await startServer();
  try {
    const attacker = await createIssuer({ issuerId: DEMO_ISSUER.issuerId });
    const forged = await signCredential(claims({ issuerId: DEMO_ISSUER.issuerId }), attacker);
    for (const path of ['/api/credentials/verify', '/api/lens', '/api/demo-credentials/upgrade']) {
      const response = await app.post(path, { posting: 'Explain steps', credentials: [forged], issuerPublicKey: attacker.publicKey });
      assert.equal(response.status, 400, path);
      assert.match((await response.json()).error, /issuerPublicKey is not accepted/, path);
    }
    // Keys smuggled inside the token header (jwk / jku / x5c) are refused too.
    for (const extra of [{ jwk: { kty: 'OKP', crv: 'Ed25519', x: attacker.publicKey } }, { jku: 'https://evil.example/keys' }, { x5c: ['AAAA'] }]) {
      const token = await signWithHeader({ alg: 'EdDSA', typ: 'JWT', kid: DEMO_ISSUER.issuerId, ...extra }, claims({ issuerId: DEMO_ISSUER.issuerId }), attacker.privateKey);
      assert.equal((await app.verifyApi(token)).body.results[0].reason, 'malformed');
    }
    // Algorithm substitution: "none" and HS256 are refused before any key is touched.
    for (const alg of ['none', 'HS256', 'ES256']) {
      const token = await signWithHeader({ alg, typ: 'JWT', kid: DEMO_ISSUER.issuerId }, claims({ issuerId: DEMO_ISSUER.issuerId }), attacker.privateKey);
      assert.equal((await app.verifyApi(token)).body.results[0].valid, false, alg);
    }
  } finally { app.close(); }
});

test('7. employer lens, /verify/:id and the public API agree for valid and forged credentials', async () => {
  const app = await startServer();
  try {
    const { token } = await (await app.post('/api/demo-credentials/issue', vouch)).json();
    const { url } = await (await app.post('/api/demo-credentials/share', { token })).json();
    const id = url.split('/').at(-1);
    const outcomes = async () => {
      const api = (await app.verifyApi(token)).body.results[0].status;
      const page = (await fetch(`${app.base}/verify/${id}`)).status;
      const lens = (await (await app.post('/api/lens', { posting: 'Explain steps clearly', credentials: [token] })).json()).stats.validCredentials;
      return { api, page, lens };
    };
    assert.deepEqual(await outcomes(), { api: 'verified', page: 200, lens: 1 });
    assert.equal((await fetch(`${app.base}/verify/${id}/qr.png`)).status, 200);
    // A forged credential is rejected by the API and the lens alike, and can't get a share page at all.
    const attacker = await createIssuer({ issuerId: DEMO_ISSUER.issuerId });
    const forged = await signCredential(claims({ issuerId: DEMO_ISSUER.issuerId }), attacker);
    assert.equal((await app.verifyApi(forged)).body.results[0].valid, false);
    assert.equal((await (await app.post('/api/lens', { posting: 'Explain steps clearly', credentials: [forged] })).json()).stats.validCredentials, 0);
    assert.equal((await app.post('/api/demo-credentials/share', { token: forged })).status, 400);
  } finally { app.close(); }
});

test('verification fails closed when the issuer records are unavailable or the credential is unknown', async () => {
  const down = await twoIssuerVerifier(() => { throw new Error('database offline'); });
  const result = await down.verify(await signCredential(claims(), down.a));
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'unavailable');
  const unknown = await twoIssuerVerifier(() => false);
  assert.equal((await unknown.verify(await signCredential(claims(), unknown.a))).reason, 'unknown_credential');
  // A signed token the issuer never recorded (e.g. made with a leaked key) is not accepted by the demo store either.
  const store = await createDemoCredentialStore(':memory:');
  try {
    const recorded = await store.issue(vouch);
    const [header, body] = recorded.split('.');
    assert.equal((await store.verify(recorded)).status, 'verified');
    assert.equal((await store.verify(`${header}.${body}.${'A'.repeat(86)}`)).valid, false);
  } finally { store.close(); }
});

test('expired and incomplete credentials are rejected', async () => {
  const { a, verify } = await twoIssuerVerifier();
  assert.equal((await verify(await signCredential(claims({ exp: Math.floor(Date.now() / 1000) - 60 }), a))).reason, 'expired');
  assert.equal((await verify(await signCredential(claims({ exp: Math.floor(Date.now() / 1000) + 3600 }), a))).valid, true);
  const { credentialId, ...noId } = claims();
  assert.equal((await verify(await signCredential(noId, a))).reason, 'missing_claims');
  for (const bad of ['', 'abc', 'a.b.c', null, 12, 'x'.repeat(20001)]) assert.equal((await verify(bad)).valid, false);
});

test('trusted issuer configuration fails securely', async () => {
  const good = (await createIssuer()).publicKey;
  await assert.rejects(loadTrustedIssuers([]), /No trusted issuers/);
  await assert.rejects(loadTrustedIssuers([{ issuerId: 'centre-a', name: 'A' }]), /no public key/);
  await assert.rejects(loadTrustedIssuers([{ issuerId: 'centre-a', name: 'A', publicKey: 'not-a-key' }]), /not a base64url Ed25519/);
  await assert.rejects(loadTrustedIssuers([{ issuerId: 'Bad Id!', name: 'A', publicKey: good }]), /issuerId/);
  await assert.rejects(loadTrustedIssuers([{ issuerId: 'centre-a', name: 'A', publicKey: good }, { issuerId: 'centre-a', name: 'B', publicKey: good }]), /twice/);
  const pair = generateKeyPairSync('ed25519');
  const other = generateKeyPairSync('ed25519');
  const privateText = pair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64url');
  const publicText = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
  await assert.rejects(createDemoCredentialStore(':memory:', { env: { DEMO_ISSUER_PRIVATE_KEY: privateText } }), /both/);
  await assert.rejects(createDemoCredentialStore(':memory:', { env: { DEMO_ISSUER_PRIVATE_KEY: privateText, DEMO_ISSUER_PUBLIC_KEY: other.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url') } }), /does not match/);
  await assert.rejects(createDemoCredentialStore(':memory:', { env: { DEMO_ISSUER_PRIVATE_KEY: 'garbage', DEMO_ISSUER_PUBLIC_KEY: publicText } }), /PKCS#8/);
  const configured = await createDemoCredentialStore(':memory:', { env: { DEMO_ISSUER_PRIVATE_KEY: privateText, DEMO_ISSUER_PUBLIC_KEY: publicText } });
  try {
    assert.equal(configured.keySource, 'environment');
    assert.equal(configured.trustedIssuers.get(DEMO_ISSUER.issuerId).publicKey, publicText);
    assert.equal((await configured.verify(await configured.issue(vouch))).status, 'verified');
  } finally { configured.close(); }
});

test('only credentials this server signed in the old format are upgraded', async () => {
  const store = await createDemoCredentialStore(':memory:');
  try {
    const stranger = await createIssuer();
    const foreignLegacy = await signCredential({ ...vouch, student: 'Priya Sharma', issuedAt: '2026-11-01' }, stranger);
    assert.equal(await store.upgrade(foreignLegacy), foreignLegacy); // not ours: unchanged, still invalid
    assert.equal((await store.verify(foreignLegacy)).valid, false);
    const current = await store.issue(vouch);
    assert.equal(await store.upgrade(current), current); // already current: unchanged
  } finally { store.close(); }
  // A credential this server signed before issuer IDs existed (old format, its own database key) is re-issued.
  const dir = await mkdtemp(join(tmpdir(), 'proofly-legacy-'));
  const filename = join(dir, 'demo.sqlite');
  let legacyStore;
  try {
    legacyStore = await createDemoCredentialStore(filename);
    legacyStore.close();
    const db = new DatabaseSync(filename);
    const { private_key: der } = db.prepare('SELECT private_key FROM demo_issuer WHERE id=1').get();
    db.close();
    const oldKey = { privateKey: await crypto.subtle.importKey('pkcs8', der, 'Ed25519', false, ['sign']) };
    const legacy = await signCredential({ ...vouch, issuer: 'Community Centre (fictional demo)', student: 'Priya Sharma', example: true, issuedAt: '2026-11-01' }, oldKey);
    legacyStore = await createDemoCredentialStore(filename);
    assert.equal((await legacyStore.verify(legacy)).valid, false); // old format alone never verifies
    const upgraded = await legacyStore.upgrade(legacy);
    assert.notEqual(upgraded, legacy);
    const result = await legacyStore.verify(upgraded);
    assert.equal(result.status, 'verified');
    assert.equal(result.credential.issuedAt, '2026-11-01');
    assert.equal(result.credential.example, true);
  } finally {
    legacyStore?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
