import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createLinkedInRouter } from './linkedin.mjs';
import { linkedinCaption } from './linkedin-caption.mjs';

const config = { appOrigin: 'http://localhost:8766', linkedinClientId: 'client', linkedinClientSecret: 'secret' };
const payload = { student: 'Priya', title: 'Help neighbours', issuer: 'Demo issuer', mappings: [{ skill: 'Communication' }] };
const id = 'a'.repeat(32);
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(20)]).toString('base64');

async function setup(fetcher, overrides = {}) {
  const app = express();
  app.use('/api/linkedin', createLinkedInRouter({ config, demoCredentials: { get: async value => value === id ? { valid: true, payload } : null }, fetcher, ...overrides }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return { base: `http://127.0.0.1:${server.address().port}/api/linkedin`, close: () => new Promise(resolve => server.close(resolve)) };
}

function provider({ uploadUrl = 'https://api.linkedin.com/mediaUpload/test', failPost = false } = {}) {
  const requests = [];
  return {
    requests,
    fetcher: async (url, options) => {
      url = String(url);
      requests.push({ url, options });
      if (url.endsWith('/accessToken')) return Response.json({ access_token: 'test-token', expires_in: 3600 });
      if (url.endsWith('/userinfo')) return Response.json({ sub: 'member123' });
      if (url.includes('registerUpload')) return Response.json({ value: { asset: 'urn:li:digitalmediaAsset:abc', uploadMechanism: { 'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl } } } });
      if (url === uploadUrl) return new Response('', { status: 201 });
      if (url.endsWith('/ugcPosts')) return new Response('', { status: failPost ? 500 : 201 });
      throw new Error('Unexpected request');
    },
  };
}

async function connect(base) {
  const start = await fetch(`${base}/connect`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  const authorization = new URL(start.headers.get('location'));
  assert.equal(authorization.searchParams.get('scope'), 'openid profile w_member_social');
  const stateCookie = start.headers.get('set-cookie').split(';')[0];
  const state = authorization.searchParams.get('state');
  const callback = await fetch(`${base}/callback?state=${state}&code=example`, { headers: { cookie: stateCookie } });
  assert.equal(callback.status, 200);
  assert.match(await callback.text(), /status:'connected'/);
  const cookies = callback.headers.getSetCookie();
  const session = cookies.find(cookie => cookie.startsWith('proofly_linkedin='));
  assert.ok(session);
  assert.match(session, /HttpOnly/);
  return session.split(';')[0];
}

test('LinkedIn connection and explicit post upload the preview and signed caption', async () => {
  const mock = provider();
  const { base, close } = await setup(mock.fetcher);
  try {
    assert.deepEqual(await (await fetch(`${base}/status`)).json(), { enabled: true, connected: false, name: null });
    const cookie = await connect(base);
    assert.deepEqual(await (await fetch(`${base}/status`, { headers: { cookie } })).json(), { enabled: true, connected: true, name: null });
    const headers = { cookie, origin: config.appOrigin, 'content-type': 'application/json' };
    const post = () => fetch(`${base}/post`, { method: 'POST', headers, body: JSON.stringify({ id, image: png }) });
    assert.equal((await fetch(`${base}/post`, { method: 'POST', headers: { ...headers, origin: 'https://evil.example' }, body: JSON.stringify({ id, image: png }) })).status, 403);
    assert.equal((await fetch(`${base}/post`, { method: 'POST', headers, body: JSON.stringify({ id: 'missing', image: png }) })).status, 400);
    assert.equal((await fetch(`${base}/post`, { method: 'POST', headers, body: JSON.stringify({ id, image: Buffer.from('not a PNG').toString('base64') }) })).status, 400);
    assert.equal(mock.requests.length, 2);
    assert.equal((await post()).status, 200);
    assert.equal(mock.requests[3].options.method, 'PUT');
    assert.deepEqual(mock.requests[3].options.body, Buffer.from(png, 'base64'));
    const share = JSON.parse(mock.requests[4].options.body);
    assert.equal(share.author, 'urn:li:person:member123');
    assert.equal(share.visibility['com.linkedin.ugc.MemberNetworkVisibility'], 'PUBLIC');
    assert.equal(share.specificContent['com.linkedin.ugc.ShareContent'].shareCommentary.text, linkedinCaption(payload, `${config.appOrigin}/verify/${id}`));
    assert.equal((await post()).status, 401);
  } finally { await close(); }
});

test('disconnect removes the session and rejects cross-origin requests', async () => {
  const mock = provider();
  const { base, close } = await setup(mock.fetcher);
  try {
    const cookie = await connect(base);
    assert.equal((await fetch(`${base}/disconnect`, { method: 'POST', headers: { cookie, origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(`${base}/disconnect`, { method: 'POST', headers: { cookie, origin: config.appOrigin } })).status, 200);
    assert.equal((await (await fetch(`${base}/status`, { headers: { cookie } })).json()).connected, false);
  } finally { await close(); }
});

test('OAuth state is bound to the browser and cannot be reused', async () => {
  const mock = provider();
  const { base, close } = await setup(mock.fetcher);
  try {
    const start = await fetch(`${base}/connect`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const cookie = start.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(`${base}/callback?state=${state}&code=example`)).status, 400);
    assert.equal(mock.requests.length, 0);
    assert.equal((await fetch(`${base}/callback?state=${state}&code=example`, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${base}/callback?state=${state}&code=example`, { headers: { cookie } })).status, 400);
  } finally { await close(); }
});

test('refuses untrusted upload URLs and does not send the access token', async () => {
  const mock = provider({ uploadUrl: 'https://attacker.example/upload' });
  const { base, close } = await setup(mock.fetcher);
  try {
    const cookie = await connect(base);
    const response = await fetch(`${base}/post`, { method: 'POST', headers: { cookie, origin: config.appOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ id, image: png }) });
    assert.equal(response.status, 502);
    assert.equal(mock.requests.length, 3);
  } finally { await close(); }
});

test('uncertain post result requires checking LinkedIn before retrying', async () => {
  const mock = provider({ failPost: true });
  const { base, close } = await setup(mock.fetcher);
  try {
    const cookie = await connect(base);
    const headers = { cookie, origin: config.appOrigin, 'content-type': 'application/json' };
    const post = () => fetch(`${base}/post`, { method: 'POST', headers, body: JSON.stringify({ id, image: png }) });
    const response = await post();
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /Check your LinkedIn profile/);
    assert.equal((await post()).status, 401);
  } finally { await close(); }
});

test('direct posting stays disabled without configuration', async () => {
  const { base, close } = await setup(() => { throw new Error('must not fetch'); }, { config: { appOrigin: config.appOrigin } });
  try {
    assert.deepEqual(await (await fetch(`${base}/status`)).json(), { enabled: false, connected: false, name: null });
    assert.equal((await fetch(`${base}/connect`)).status, 503);
  } finally { await close(); }
});
