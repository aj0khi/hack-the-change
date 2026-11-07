import test from 'node:test';
import assert from 'node:assert/strict';
import { createBedrockGenerator, hasBedrockCredentials } from './bedrock.mjs';
import { lensSchema } from './lens.mjs';

const reply = content => ({ output: { message: { role: 'assistant', content } } });

test('no AWS credentials means no generator (lens falls back offline)', async () => {
  assert.equal(await createBedrockGenerator({ env: {} }), null);
  assert.equal(hasBedrockCredentials({ AWS_ACCESS_KEY_ID: 'x' }), false);
  assert.equal(hasBedrockCredentials({ AWS_ACCESS_KEY_ID: 'x', AWS_SECRET_ACCESS_KEY: 'y' }), true);
  assert.equal(hasBedrockCredentials({ AWS_BEARER_TOKEN_BEDROCK: 'k' }), true);
});

test('sends the lens schema as a forced tool and returns the tool input', async () => {
  const sent = [];
  const answer = { requirements: [{ text: 'SQL', kind: 'technical', matches: [] }] };
  const client = { async send(command) { sent.push(command.input); return reply([{ toolUse: { toolUseId: '1', name: 'report_lens', input: answer } }]); } };
  const generate = await createBedrockGenerator({ client, modelId: 'test-model' });
  assert.deepEqual(await generate({ prompt: 'hello', schema: lensSchema }), answer);
  assert.equal(sent[0].modelId, 'test-model');
  assert.deepEqual(sent[0].toolConfig.toolChoice, { tool: { name: 'report_lens' } });
  assert.equal(sent[0].toolConfig.tools[0].toolSpec.inputSchema.json, lensSchema);
  assert.equal(sent[0].messages[0].content[0].text, 'hello');
});

test('falls back to toolChoice any, and to JSON in text', async () => {
  const choices = [];
  const client = { async send(command) {
    choices.push(command.input.toolConfig.toolChoice);
    if (command.input.toolConfig.toolChoice.tool) throw new Error('ValidationException: toolChoice tool is not supported');
    return reply([{ text: 'Here you go: {"requirements": []}' }]);
  } };
  const generate = await createBedrockGenerator({ client });
  assert.deepEqual(await generate({ prompt: 'x', schema: lensSchema }), { requirements: [] });
  assert.deepEqual(choices, [{ tool: { name: 'report_lens' } }, { any: {} }]);
});

test('other errors and empty answers propagate so the lens can fall back', async () => {
  const failing = await createBedrockGenerator({ client: { async send() { throw new Error('AccessDeniedException'); } } });
  await assert.rejects(failing({ prompt: 'x', schema: lensSchema }), /AccessDenied/);
  const empty = await createBedrockGenerator({ client: { async send() { return reply([{ text: 'no json here' }]); } } });
  await assert.rejects(empty({ prompt: 'x', schema: lensSchema }), /no structured result/);
});
