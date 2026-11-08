import test from 'node:test';
import assert from 'node:assert/strict';
import { linkedinCaption } from './linkedin-caption.mjs';
import { createApp } from '../server-app.mjs';

test('LinkedIn caption contains credential details, verification link and demo disclaimer', () => {
  const caption = linkedinCaption({
    student: 'Priya', title: 'Help neighbours', issuer: 'Demo issuer',
    mappings: [{ skill: 'Communication' }, { skill: 'Digital' }],
  }, 'https://example.com/verify/example');
  assert.match(caption, /Priya — Help neighbours/);
  assert.match(caption, /Communication, Digital/);
  assert.match(caption, /https:\/\/example.com\/verify\/example/);
  assert.match(caption, /Fictional demo only/);
});

test('direct LinkedIn posting endpoint is no longer available', async () => {
  const app = createApp({ config: { appOrigin: 'http://localhost:8766' } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/linkedin/post`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
