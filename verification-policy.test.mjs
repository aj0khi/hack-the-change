import test from 'node:test';
import assert from 'node:assert/strict';
import { backingEligibility } from './verification-policy.mjs';

const person = id => ({ id, status: 'active', identityStatus: 'verified', identityUniqueness: 'approved', identityKey: `identity-${id}`, contactStatus: 'verified' });
const scenario = () => ({ recipient: person('recipient'), witness: person('witness'), coordinator: { ...person('coordinator'), organizationId: 'org', organizationRole: 'approved_coordinator' }, organization: { id: 'org', status: 'approved', registryStatus: 'verified', contactStatus: 'verified' } });

test('only independently verified participants and organization can back a recipient', () => {
  assert.equal(backingEligibility(scenario()).allowed, true);
  for (const change of [
    state => { state.recipient.identityStatus = 'pending'; },
    state => { state.witness.contactStatus = 'pending'; },
    state => { state.coordinator.identityUniqueness = 'pending'; },
    state => { state.organization.registryStatus = 'pending'; },
    state => { state.organization.contactStatus = 'pending'; },
    state => { state.coordinator.organizationRole = 'member'; },
    state => { state.coordinator.organizationId = 'other'; },
    state => { state.witness.id = state.recipient.id; },
    state => { state.witness.identityKey = state.recipient.identityKey; },
    state => { state.existingBacking = true; }
  ]) {
    const state = scenario();
    change(state);
    assert.equal(backingEligibility(state).allowed, false);
  }
});

test('missing records fail closed', () => {
  assert.equal(backingEligibility({}).allowed, false);
});