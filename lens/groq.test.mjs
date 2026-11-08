import test from 'node:test';
import assert from 'node:assert/strict';
import { createGroqGenerator, DEFAULT_GROQ_MODEL } from './groq.mjs';
import { lensSchema } from './lens.mjs';

const ok = content => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });
const fail = (status, message) => ({ ok: false, status, statusText: 'err', json: async () => ({ error: { message } }) });

test('no GROQ_API_KEY means no generator', () => {
  assert.equal(createGroqGenerator({}), null);
  assert.equal(createGroqGenerator({ apiKey: '' }), null);
});

test('sends the lens schema as a JSON schema and parses the answer', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return ok('{"requirements":[]}'); };
  const generate = createGroqGenerator({ apiKey: 'test-key', fetchImpl });
  assert.deepEqual(await generate({ prompt: 'posting', schema: lensSchema }), { requirements: [] });
  const { url, init, body } = calls[0];
  assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(init.headers.Authorization, 'Bearer test-key');
  assert.equal(body.model, DEFAULT_GROQ_MODEL);
  assert.equal(body.response_format.type, 'json_schema');
  assert.deepEqual(body.response_format.json_schema.schema, lensSchema);
  assert.equal(body.reasoning_effort, 'low');
  assert.equal(body.messages.at(-1).content, 'posting');
});

test('falls back to JSON mode when the model rejects json_schema', async () => {
  const formats = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    formats.push(body.response_format.type);
    return body.response_format.type === 'json_schema' ? fail(400, 'response_format json_schema is not supported by this model') : ok('{"requirements":[]}');
  };
  const generate = createGroqGenerator({ apiKey: 'k', model: 'some/other-model', fetchImpl });
  assert.deepEqual(await generate({ prompt: 'x', schema: lensSchema }), { requirements: [] });
  assert.deepEqual(formats, ['json_schema', 'json_object']);
});

test('rate limits and auth errors propagate so the lens falls back offline', async () => {
  const limited = createGroqGenerator({ apiKey: 'k', fetchImpl: async () => fail(429, 'Rate limit reached for tokens per minute') });
  await assert.rejects(limited({ prompt: 'x', schema: lensSchema }), /Groq 429/);
  const badKey = createGroqGenerator({ apiKey: 'k', fetchImpl: async () => fail(401, 'Invalid API Key') });
  await assert.rejects(badKey({ prompt: 'x', schema: lensSchema }), /Groq 401/);
  const empty = createGroqGenerator({ apiKey: 'k', fetchImpl: async () => ok('') });
  await assert.rejects(empty({ prompt: 'x', schema: lensSchema }), /no content/);
});
