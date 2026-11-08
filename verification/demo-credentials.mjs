import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, randomBytes, webcrypto } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { signCredential, verifyCredential } from '../trust.mjs';
import { skillTerms } from '../lens/skills.mjs';

export async function createDemoCredentialStore(filename) {
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    try { closeSync(openSync(filename, 'wx', 0o600)); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS demo_issuer (id INTEGER PRIMARY KEY CHECK(id=1), private_key BLOB NOT NULL, public_key TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_demo_credentials (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS fictional_demo_students (name TEXT PRIMARY KEY, credential_ids TEXT NOT NULL);`);
  const keys = generateKeyPairSync('ed25519');
  const privateBytes = keys.privateKey.export({ type: 'pkcs8', format: 'der' });
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
  db.prepare('INSERT OR IGNORE INTO demo_issuer(id,private_key,public_key) VALUES(1,?,?)').run(privateBytes, publicKey);
  const saved = db.prepare('SELECT private_key,public_key FROM demo_issuer WHERE id=1').get();
  const privateKey = await webcrypto.subtle.importKey('pkcs8', saved.private_key, 'Ed25519', false, ['sign']);
  const issuer = { privateKey, publicKey: saved.public_key };

  return {
    publicKey: issuer.publicKey,
    async issue(input) {
      const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit ? value.trim() : null;
      const title = text(input?.title, 150);
      const witness = text(input?.witness, 40);
      const transcript = text(input?.transcript, 2000);
      const student = input?.student === undefined ? 'Priya Sharma' : text(input.student, 100);
      const mappings = input?.mappings;
      if (!title || !witness || !transcript || !student || !Array.isArray(mappings) || mappings.length < 1 || mappings.length > 9 ||
        mappings.some(m => !m || !Object.hasOwn(skillTerms, m.skill) || typeof m.quote !== 'string' || !m.quote.trim() || !transcript.includes(m.quote))) {
        throw new TypeError('Provide a demo student name, project, witness, transcript, and supported skills grounded in the transcript.');
      }
      const payload = {
        title, witness, transcript, issuer: 'Community Centre (fictional demo)', student,
        example: input.example === true, demoProfile: input.demoProfile === true, issuedAt: new Date().toISOString().slice(0, 10),
        mappings: mappings.map(({ skill, quote }) => ({ skill, quote })),
      };
      return signCredential(payload, issuer);
    },
    async publish(token) {
      if (typeof token !== 'string' || token.length > 15000 || !(await verifyCredential(token, issuer.publicKey)).valid) return null;
      const existing = db.prepare('SELECT id FROM shared_demo_credentials WHERE token=?').get(token);
      if (existing) return existing.id;
      const id = randomBytes(24).toString('base64url');
      db.prepare('INSERT OR IGNORE INTO shared_demo_credentials(id,token) VALUES(?,?)').run(id, token);
      return db.prepare('SELECT id FROM shared_demo_credentials WHERE token=?').get(token).id;
    },
    async get(id) {
      if (!/^[A-Za-z0-9_-]{32}$/.test(id)) return null;
      const row = db.prepare('SELECT token FROM shared_demo_credentials WHERE id=?').get(id);
      if (!row) return null;
      return verifyCredential(row.token, issuer.publicKey);
    },
    async getPublished(id) {
      if (!/^[A-Za-z0-9_-]{32}$/.test(id)) return null;
      const row = db.prepare('SELECT token FROM shared_demo_credentials WHERE id=?').get(id);
      if (!row) return null;
      const result = await verifyCredential(row.token, issuer.publicKey);
      return result.valid ? { token: row.token, payload: result.payload } : { valid: false };
    },
    async getFictionalDemoStudents(appOrigin) {
      const profiles = [
        {
          name: 'Alex Rivera',
          credentials: [{
            title: 'Helped neighbours use shared devices', witness: 'Morgan', transcript: 'Alex explained video calls in clear steps and helped neighbours set up tablets. They worked with the centre team to write a simple guide.',
            mappings: [
              { skill: 'Communication', quote: 'Alex explained video calls in clear steps' },
              { skill: 'Digital', quote: 'helped neighbours set up tablets' },
              { skill: 'Writing', quote: 'write a simple guide' },
            ],
          }],
        },
        {
          name: 'Jordan Lee',
          credentials: [{
            title: 'Organized a community pantry', witness: 'Taylor', transcript: 'Jordan tracked pantry supplies in a spreadsheet, calculated weekly totals, and worked with volunteers to solve delivery problems.',
            mappings: [
              { skill: 'Digital', quote: 'tracked pantry supplies in a spreadsheet' },
              { skill: 'Numeracy', quote: 'calculated weekly totals' },
              { skill: 'Problem solving', quote: 'solve delivery problems' },
            ],
          }],
        },
        {
          name: 'Sam Chen',
          credentials: [{
            title: 'Created a community resource guide', witness: 'Casey', transcript: 'Sam wrote clear resource descriptions, adapted the guide after community feedback, and collaborated with local volunteers.',
            mappings: [
              { skill: 'Writing', quote: 'wrote clear resource descriptions' },
              { skill: 'Adaptability', quote: 'adapted the guide after community feedback' },
              { skill: 'Collaboration', quote: 'collaborated with local volunteers' },
            ],
          }],
        },
        {
          name: 'Riley Morgan',
          credentials: [{
            title: 'Supported a neighbourhood welcome desk', witness: 'Avery', transcript: 'Riley welcomed visitors, explained local services, and adapted when the event schedule changed.',
            mappings: [
              { skill: 'Communication', quote: 'explained local services' },
              { skill: 'Collaboration', quote: 'welcomed visitors' },
              { skill: 'Adaptability', quote: 'adapted when the event schedule changed' },
            ],
          }],
        },
      ];
      const upsert = db.prepare(`INSERT INTO fictional_demo_students(name,credential_ids) VALUES(?,?)
        ON CONFLICT(name) DO UPDATE SET credential_ids=excluded.credential_ids`);
      const listed = [];
      for (const profile of profiles) {
        const saved = db.prepare('SELECT credential_ids FROM fictional_demo_students WHERE name=?').get(profile.name);
        let ids = saved ? JSON.parse(saved.credential_ids) : [];
        let credentials = ids.length === profile.credentials.length
          ? await Promise.all(ids.map(id => this.getPublished(id)))
          : [];
        const isCurrent = credentials.length === profile.credentials.length
          && credentials.every(credential => credential?.payload?.student === profile.name && credential.payload.demoProfile === true);
        if (!isCurrent) {
          credentials = [];
          ids = [];
          for (const credential of profile.credentials) {
            const token = await this.issue({ ...credential, student: profile.name, demoProfile: true });
            const id = await this.publish(token);
            if (!id) throw new Error('Could not publish a fictional demo student credential.');
            ids.push(id);
            credentials.push(await this.getPublished(id));
          }
          upsert.run(profile.name, JSON.stringify(ids));
        }
        listed.push({
          name: profile.name,
          skills: [...new Set(credentials.flatMap(credential => credential.payload.mappings.map(mapping => mapping.skill)))],
          links: ids.map(id => `${appOrigin}/verify/${id}`),
        });
      }
      return listed;
    },
    close() { db.close(); },
  };
}
