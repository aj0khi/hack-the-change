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
    CREATE TABLE IF NOT EXISTS shared_demo_credentials (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE);`);
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
      const mappings = input?.mappings;
      if (!title || !witness || !transcript || !Array.isArray(mappings) || mappings.length < 1 || mappings.length > 9 ||
        mappings.some(m => !m || !Object.hasOwn(skillTerms, m.skill) || typeof m.quote !== 'string' || !m.quote.trim() || !transcript.includes(m.quote))) {
        throw new TypeError('Provide a project, witness, transcript, and supported skills grounded in the transcript.');
      }
      const payload = {
        title, witness, transcript, issuer: 'Community Centre (fictional demo)', student: 'Priya Sharma',
        example: input.example === true, issuedAt: new Date().toISOString().slice(0, 10),
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
    close() { db.close(); },
  };
}
