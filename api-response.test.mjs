import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiResponse } from './api-response.mjs';

test('reports rate limits and non-JSON errors without JSON parsing failures', async () => {
  await assert.rejects(readApiResponse(new Response('Too many requests', { status: 429 })), /Too many requests.*wait/);
  await assert.rejects(readApiResponse(new Response('Unavailable', { status: 503 }), 'Service unavailable.'), /Service unavailable.*503/);
  await assert.rejects(readApiResponse(new Response('not json', { headers: { 'content-type': 'application/json' } })), /invalid response/);
  await assert.rejects(readApiResponse(Response.json({ error: 'Please retry later.' }, { status: 429 })), /Please retry later/);
  assert.deepEqual(await readApiResponse(Response.json({ ok: true })), { ok: true });
});
