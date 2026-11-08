import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createDemoCredentialStore } from './demo-credentials.mjs';
import { createVerificationStore } from './verification-store.mjs';
import { createApp } from '../server-app.mjs';
import { alterCredential } from '../trust.mjs';

const demo = {
  title: '<script>alert(1)</script>', witness: 'Doug', transcript: 'Priya explained each step.',
  mappings: [{ skill: 'Communication', quote: 'Priya explained each step.' }],
};

test('server issues, shares, verifies and retains demo credentials across restarts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'proofly-demo-'));
  const filename = join(dir, 'shared.sqlite');
  let credentials;
  let accounts;
  let server;
  try {
    credentials = await createDemoCredentialStore(filename);
    accounts = createVerificationStore(':memory:');
    server = createApp({ config: { appOrigin: 'https://proofly.example' }, store: accounts, demoCredentials: credentials }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const issuer = await (await fetch(base + '/api/demo-credentials/issuer')).json();
    assert.deepEqual(issuer, { issuerId: 'proofly-demo-centre', name: 'Community Centre (fictional demo)' }); // no key material
    const robots = await fetch(base + '/robots.txt', { headers: { 'user-agent': 'LinkedInBot' } });
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /User-agent: LinkedInBot\s+Allow: \//);
    const issue = await post('/api/demo-credentials/issue', demo);
    assert.equal(issue.status, 201);
    const { token } = await issue.json();
    const [checked] = (await (await post('/api/credentials/verify', { credentials: [token] })).json()).results;
    assert.equal(checked.status, 'verified');
    assert.equal(checked.issuerName, 'Community Centre (fictional demo)');
    assert.equal((await post('/api/demo-credentials/issue', { ...demo, mappings: [{ skill: 'Digital', quote: 'fabricated' }] })).status, 400);
    assert.equal((await post('/api/demo-credentials/share', { token: alterCredential(token) })).status, 400);
    const shared = await (await post('/api/demo-credentials/share', { token })).json();
    const id = shared.url.split('/').at(-1);
    assert.equal(shared.url, `https://proofly.example/verify/${id}`);
    assert.equal((await (await post('/api/demo-credentials/share', { token })).json()).url, shared.url);
    const page = await fetch(`${base}/verify/${id}`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    const html = await page.text();
    assert.match(html, /Signature valid ✓/);
    assert.match(html, /Doug/);
    assert.match(html, /Priya explained each step/);
    assert.match(html, /fictional demo/i);
    assert.match(html, /<meta property="og:title" content="Proofly \| Fictional demo credential">/);
    assert.match(html, new RegExp(`<meta property="og:url" content="${shared.url}">`));
    assert.match(html, /<meta property="og:image" content="https:\/\/proofly\.example\/proofly-share-preview\.png">/);
    assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
    const preview = await fetch(base + '/proofly-share-preview.png');
    assert.equal(preview.status, 200);
    assert.match(preview.headers.get('content-type'), /image\/png/);
    const bytes = Buffer.from(await preview.arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), 1200);
    assert.equal(bytes.readUInt32BE(20), 630);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>alert/);
    const qr = await fetch(base + shared.qrUrl);
    assert.equal(qr.headers.get('content-type'), 'image/png');
    assert.deepEqual([...new Uint8Array(await qr.arrayBuffer()).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal((await fetch(base + '/verify/not-found')).status, 404);
    const firstKey = [...credentials.trustedIssuers.values()][0].publicKey;
    await new Promise(resolve => server.close(resolve)); server = null;
    credentials.close(); credentials = null;
    const mode = (await stat(filename)).mode & 0o777;
    if (process.platform !== 'win32') assert.equal(mode, 0o600); // Windows has no POSIX file modes
    credentials = await createDemoCredentialStore(filename);
    assert.equal([...credentials.trustedIssuers.values()][0].publicKey, firstKey); // same issuer key after a restart
    assert.equal((await credentials.verify(credentials.getSharedToken(id))).status, 'verified');
    credentials.close(); credentials = null;
    const db = new DatabaseSync(filename);
    db.prepare('UPDATE shared_demo_credentials SET token=? WHERE id=?').run(alterCredential(token), id);
    db.close();
    credentials = await createDemoCredentialStore(filename);
    assert.equal((await credentials.verify(credentials.getSharedToken(id))).valid, false);
    server = createApp({ config: { appOrigin: 'https://proofly.example' }, store: accounts, demoCredentials: credentials }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const invalid = await fetch(`http://127.0.0.1:${server.address().port}/verify/${id}`);
    assert.equal(invalid.status, 422);
    assert.match(await invalid.text(), /Verification failed/);
    assert.doesNotMatch(await (await fetch(`http://127.0.0.1:${server.address().port}/verify/${id}`)).text(), /property="og:title"/);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    credentials?.close();
    accounts?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
