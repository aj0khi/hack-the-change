import test from 'node:test';
import assert from 'node:assert/strict';
import { displayNameFromEmail } from './account-name.mjs';

test('derives a display name from the email local part', () => {
  assert.equal(displayNameFromEmail('jane.doe+demo@example.com'), 'Jane Doe');
  assert.equal(displayNameFromEmail('sam_chen-smith@example.com'), 'Sam Chen Smith');
  assert.equal(displayNameFromEmail('élise@example.com'), 'Élise');
});

test('rejects unusable addresses and bounds the display name', () => {
  for (const email of [null, '', 'not-an-email', '@example.com', '123@example.com', 'name@', 'a@b@c']) {
    assert.equal(displayNameFromEmail(email), null);
  }
  assert.equal(displayNameFromEmail(`${'a'.repeat(100)}@example.com`).length, 80);
});
