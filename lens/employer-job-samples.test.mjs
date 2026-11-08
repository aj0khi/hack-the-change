import test from 'node:test';
import assert from 'node:assert/strict';
import { employerJobSamples } from './employer-job-samples.mjs';

test('offline Calgary employer roles are clearly marked as illustrative samples', () => {
  assert.equal(employerJobSamples.length, 4);
  for (const job of employerJobSamples) {
    assert.equal(job.demo, true);
    assert.equal(job.company, 'Illustrative demo employer');
    assert.equal(job.location, 'Calgary, AB');
    assert.match(job.description, /^Illustrative demo posting — not an active vacancy\./);
    assert.equal(job.url, undefined);
  }
});
