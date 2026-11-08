import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server-app.mjs';
import { createDemoCredentialStore } from '../verification/demo-credentials.mjs';
import { createVerificationStore } from '../verification/verification-store.mjs';

const origin = 'https://proofly.example';
const transcript = 'She explained the steps clearly.';

async function setup(generate) {
  const credentials = await createDemoCredentialStore(':memory:');
  const accounts = createVerificationStore(':memory:');
  const token = await credentials.issue({ title: 'Help neighbours', witness: 'Doug', transcript, mappings: [{ skill: 'Communication', quote: transcript }] });
  const id = await credentials.publish(token);
  const second = await credentials.issue({ title: 'Another project', witness: 'Jane', transcript, mappings: [{ skill: 'Communication', quote: transcript }] });
  const secondId = await credentials.publish(second);
  const app = createApp({ config: { appOrigin: origin }, store: accounts, demoCredentials: credentials, lens: { generate, model: 'test-model' } });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const link = `${origin}/verify/${id}`;
  const post = body => fetch(`${base}/api/employer/lens`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { link, secondLink: `${origin}/verify/${secondId}`, post, base, credentials, close: async () => { await new Promise(resolve => server.close(resolve)); credentials.close(); accounts.close(); } };
}

test('employer lens resolves multiple published links without local student credentials', async () => {
  const t = await setup();
  try {
    const response = await t.post({ posting: 'Communication skills are required.', links: [t.link, t.secondLink] });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.mode, 'offline');
    assert.equal(data.sources.length, 2);
    assert.deepEqual(data.sources.map(source => source.witness), ['Doug', 'Jane']);
    assert.deepEqual(data.requirements[0].matches.map(match => match.credentialId), ['0', '1']);
    assert.equal(data.requirements[0].matches[0].quote, transcript);
    assert.equal(data.requirements.length, 1);
    assert.equal(data.requirements[0].text, 'Communication');
    assert.match(data.requirements[0].context, /Communication skills are required/);
    assert.equal(JSON.stringify(data).includes('eyJ'), false);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(`${t.base}/employer`)).status, 200);
  } finally { await t.close(); }
});

test('employer AI uses verified published evidence and grounds proposed quotes', async () => {
  let prompt;
  const t = await setup(async input => {
    prompt = input.prompt;
    return { requirements: [{ text: 'Communication', kind: 'soft', matches: [
      { credentialId: '0', quote: transcript, evidenceType: 'action', why: 'Explained steps.' },
      { credentialId: '0', quote: 'fabricated', evidenceType: 'action', why: 'Made up.' },
    ] }] };
  });
  try {
    const response = await t.post({ posting: 'Communication skills', links: [t.link] });
    const data = await response.json();
    assert.equal(data.mode, 'ai');
    assert.match(prompt, /She explained the steps clearly/);
    assert.equal(data.requirements[0].matches.length, 1);
    assert.equal(data.stats.droppedByGrounding, 1);
  } finally { await t.close(); }
});

test('employer lens rejects invalid, foreign, missing, duplicate and excessive links before AI', async () => {
  let calls = 0;
  const t = await setup(async () => { calls++; return { requirements: [] }; });
  try {
    for (const links of [[], ['not-a-url'], [42], ['x'.repeat(2049)], [t.link.replace(origin, 'https://evil.example')], [`${t.link}?x=1`], [`${t.link}/qr.png`], [t.link, t.link], Array(11).fill(t.link)]) {
      assert.equal((await t.post({ posting: 'Communication', links })).status, 400);
    }
    assert.equal((await t.post({ posting: 'Communication', links: [`${origin}/verify/${'a'.repeat(32)}`] })).status, 404);
    assert.equal((await t.post({ posting: '', links: [t.link] })).status, 400);
    assert.equal((await t.post({ posting: 'x'.repeat(12001), links: [t.link] })).status, 400);
    assert.equal(calls, 0);
    const original = t.credentials.getPublished;
    t.credentials.getPublished = async () => ({ valid: false });
    assert.equal((await t.post({ posting: 'Communication', links: [t.link] })).status, 422);
    t.credentials.getPublished = original;
  } finally { await t.close(); }
});

test('employer lens refuses to combine evidence with different named students', async () => {
  let calls = 0;
  const t = await setup(async () => { calls++; return { requirements: [] }; });
  try {
    const original = t.credentials.getPublished;
    t.credentials.getPublished = async id => {
      const credential = await original(id);
      return id === t.secondLink.split('/').pop()
        ? { ...credential, payload: { ...credential.payload, student: 'Another student' } }
        : credential;
    };
    const response = await t.post({ posting: 'Communication', links: [t.link, t.secondLink] });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /one student at a time/i);
    assert.equal(calls, 0);
  } finally { await t.close(); }
});

test('separately shared fictional students can each be analyzed for the same posting', async () => {
  const t = await setup();
  try {
    const token = await t.credentials.issue({ student: 'Alex Example', title: 'Help neighbours', witness: 'Alex', transcript, mappings: [{ skill: 'Communication', quote: transcript }] });
    const id = await t.credentials.publish(token);
    const first = await (await t.post({ posting: 'Communication skills', links: [t.link] })).json();
    const second = await (await t.post({ posting: 'Communication skills', links: [`${origin}/verify/${id}`] })).json();
    assert.equal(first.sources[0].student, 'Priya Sharma');
    assert.equal(second.sources[0].student, 'Alex Example');
    assert.equal(first.requirements[0].matches.length, 1);
    assert.equal(second.requirements[0].matches.length, 1);
    assert.equal((await t.post({ posting: 'Communication skills', links: [t.link, `${origin}/verify/${id}`] })).status, 400);
  } finally { await t.close(); }
});

test('employer demo student picker returns repeatable fictional signed profiles', async () => {
  const t = await setup();
  try {
    const first = await (await fetch(`${t.base}/api/employer/demo-students`)).json();
    const second = await (await fetch(`${t.base}/api/employer/demo-students`)).json();
    assert.equal(first.students.length, 5);
    assert.deepEqual(first, second);
    assert.deepEqual(first.students.map(student => student.name), ['Alex Rivera', 'Jordan Lee', 'Sam Chen', 'Riley Morgan', 'Priya Sharma']);
    for (const student of first.students) {
      assert.equal(student.links.length, 1);
      assert(student.skills.length >= 3);
      const link = new URL(student.links[0]);
      assert.equal(link.origin, origin);
      assert.match(link.pathname, /^\/verify\/[A-Za-z0-9_-]{32}$/);
      const credential = await t.credentials.getPublished(link.pathname.split('/').at(-1));
      assert.equal(credential.payload.student, student.name);
      assert.equal(credential.payload.demoProfile, true);
      assert.equal(student.credentials.length, 1);
      assert.equal(student.credentials[0].token, credential.token);
    }
    const priya = first.students.find(student => student.name === 'Priya Sharma');
    assert.equal(priya.role, 'Customer service · fictional scenario');
    assert.deepEqual(priya.skills, ['Communication', 'Digital', 'Problem solving', 'Adaptability', 'Collaboration']);
    const priyaCredential = await t.credentials.getPublished(new URL(priya.links[0]).pathname.split('/').at(-1));
    assert.match(priyaCredential.payload.title, /Durabuilt Windows & Doors \(fictional scenario\)/);
    assert.match(priyaCredential.payload.transcript, /fictional customer-service practice scenario/);
    assert.deepEqual(priyaCredential.payload.mappings.map(mapping => mapping.skill), priya.skills);
  } finally { await t.close(); }
});

test('student and employer pages contain their own tools', async () => {
  const t = await setup();
  try {
    const student = await (await fetch(`${t.base}/`)).text();
    const employer = await (await fetch(`${t.base}/employer`)).text();
    assert.match(student, /id="credentials-list"/);
    assert.match(student, /href="\/employer"/);
    assert.match(student, /id="student-ai-analyze"/);
    assert.doesNotMatch(student, /id="badge-lookup-form"|id="employer-form"/);
    assert.match(employer, /id="employer-form"/);
    assert.match(employer, /id="employer-job-select"/);
    assert.match(employer, /CALGARY JOBS &amp; SAMPLE ROLES/);
    assert.match(employer, /id="employer-job-file"/);
    assert.match(employer, /accept="\.txt,\.md,text\/plain,text\/markdown"/);
    assert.match(employer, /id="employer-student-select"/);
    assert.match(employer, /id="employer-add-student"/);
    assert.match(employer, /Leave a blank line between students/);
    assert.match(employer, /id="badge-lookup-form"/);
    assert.doesNotMatch(employer, /id="credentials-list"|id="vouch-form"|id="job-description"/);
    const samples = await fetch(`${t.base}/lens/employer-job-samples.mjs`);
    assert.equal(samples.status, 200);
    assert.match(await samples.text(), /not an active vacancy/);
  } finally { await t.close(); }
});
