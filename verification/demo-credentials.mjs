import { DatabaseSync } from 'node:sqlite';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, webcrypto } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { CREDENTIAL_ALG, CREDENTIAL_TYP, decodeCredential, signCredential, verifySignature } from '../trust.mjs';
import { skillTerms } from '../lens/skills.mjs';
import { DEMO_ISSUER, TrustedIssuerConfigError, loadTrustedIssuers } from './trusted-issuers.mjs';
import { createCredentialVerifier } from './credential-verifier.mjs';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// Demo issuer signing key. Both env vars set: use them (and check they are one pair). Exactly one set:
// refuse to start. Neither: use the key generated once and kept in the private demo database.
async function resolveSigningKey(env, saved) {
  const privateText = env.DEMO_ISSUER_PRIVATE_KEY?.trim();
  const publicText = env.DEMO_ISSUER_PUBLIC_KEY?.trim();
  if (!privateText && !publicText) return { privateDer: saved.private_key, publicKey: saved.public_key, source: 'database' };
  if (!privateText || !publicText)
    throw new TrustedIssuerConfigError('Set both DEMO_ISSUER_PRIVATE_KEY and DEMO_ISSUER_PUBLIC_KEY, or neither.');
  let privateDer;
  let derivedPublic;
  try {
    const key = createPrivateKey({ key: Buffer.from(privateText, 'base64url'), format: 'der', type: 'pkcs8' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not ed25519');
    privateDer = key.export({ type: 'pkcs8', format: 'der' });
    derivedPublic = createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64url');
  } catch {
    throw new TrustedIssuerConfigError('DEMO_ISSUER_PRIVATE_KEY is not a base64url Ed25519 PKCS#8 key.');
  }
  if (derivedPublic !== publicText)
    throw new TrustedIssuerConfigError('DEMO_ISSUER_PUBLIC_KEY does not match DEMO_ISSUER_PRIVATE_KEY.');
  return { privateDer, publicKey: publicText, source: 'environment' };
}

/**
 * The demo issuer (this server signs vouches as "Community Centre (fictional demo)") plus its record of
 * which credentials it issued. `verify` is the shared verifier for every route.
 * options.env: process.env-like object for DEMO_ISSUER_* keys.
 */
export async function createDemoCredentialStore(filename, { env = {} } = {}) {
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    try { closeSync(openSync(filename, 'wx', 0o600)); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS demo_issuer (id INTEGER PRIMARY KEY CHECK(id=1), private_key BLOB NOT NULL, public_key TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_demo_credentials (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS fictional_demo_students (name TEXT PRIMARY KEY, credential_ids TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS issued_credentials (
      credential_id TEXT PRIMARY KEY,
      issuer_id TEXT NOT NULL,
      token_sha256 TEXT NOT NULL,
      issued_at TEXT NOT NULL
    );`);
  const keys = generateKeyPairSync('ed25519');
  db.prepare('INSERT OR IGNORE INTO demo_issuer(id,private_key,public_key) VALUES(1,?,?)').run(
    keys.privateKey.export({ type: 'pkcs8', format: 'der' }),
    keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
  );
  const saved = db.prepare('SELECT private_key,public_key FROM demo_issuer WHERE id=1').get();
  const signing = await resolveSigningKey(env, saved);
  const issuer = {
    issuerId: DEMO_ISSUER.issuerId,
    privateKey: await webcrypto.subtle.importKey('pkcs8', signing.privateDer, 'Ed25519', false, ['sign']),
  };
  // Credentials from before issuer IDs were signed in were signed with the database key; only it can upgrade them.
  const legacyKey = await webcrypto.subtle.importKey('spki', Buffer.from(saved.public_key, 'base64url'), 'Ed25519', false, ['verify']);

  const trustedIssuers = await loadTrustedIssuers([{ ...DEMO_ISSUER, publicKey: signing.publicKey }]);

  // Did this issuer issue exactly this token? (Not issued here, or a different token with the same ID: no.)
  function isIssued(issuerId, credentialId, token) {
    const row = db.prepare('SELECT issuer_id, token_sha256 FROM issued_credentials WHERE credential_id=?').get(credentialId);
    return Boolean(row && row.issuer_id === issuerId && row.token_sha256 === sha256(token));
  }
  const verify = createCredentialVerifier({ issuers: trustedIssuers, isIssued });

  // The authoritative stored token for a share link (verify it with `verify`), or null.
  function getSharedToken(id) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(id)) return null;
    return db.prepare('SELECT token FROM shared_demo_credentials WHERE id=?').get(id)?.token ?? null;
  }

  async function sign(fields) {
    const payload = { credentialId: randomBytes(16).toString('base64url'), issuerId: DEMO_ISSUER.issuerId, ...fields };
    const token = await signCredential(payload, issuer);
    db.prepare('INSERT INTO issued_credentials(credential_id,issuer_id,token_sha256,issued_at) VALUES(?,?,?,?)')
      .run(payload.credentialId, payload.issuerId, sha256(token), new Date().toISOString());
    return token;
  }

  function cleanFields(input) {
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
    // The issuer name is not taken from the request (or signed at all): verification shows the registry name.
    return {
      title, witness, transcript, student, example: input.example === true, demoProfile: input.demoProfile === true,
      mappings: mappings.map(({ skill, quote }) => ({ skill, quote })),
    };
  }

  return {
    issuerId: DEMO_ISSUER.issuerId,
    issuerName: DEMO_ISSUER.name,
    keySource: signing.source,
    trustedIssuers,
    verify,
    validateInput(input) {
      return cleanFields(input);
    },
    async issue(input) {
      return sign({ ...cleanFields(input), issuedAt: new Date().toISOString().slice(0, 10) });
    },
    // Re-issues credentials made before issuer IDs were signed in, but ONLY ones this server signed itself
    // (checked with its own stored key). Anything else comes back unchanged and will not verify.
    async upgrade(token) {
      const decoded = decodeCredential(token);
      if (!decoded || decoded.payload.issuerId !== undefined || decoded.header.kid !== undefined) return token;
      if (decoded.header.alg !== CREDENTIAL_ALG || decoded.header.typ !== CREDENTIAL_TYP || Object.keys(decoded.header).length !== 2) return token;
      if (!(await verifySignature(decoded, legacyKey))) return token;
      let fields;
      try { fields = cleanFields(decoded.payload); } catch { return token; }
      const issuedAt = /^\d{4}-\d{2}-\d{2}$/.test(decoded.payload.issuedAt) ? decoded.payload.issuedAt : new Date().toISOString().slice(0, 10);
      return sign({ ...fields, example: decoded.payload.example === true, issuedAt });
    },
    async publish(token) {
      if (typeof token !== 'string' || token.length > 15000 || (await verify(token)).status !== 'verified') return null;
      const existing = db.prepare('SELECT id FROM shared_demo_credentials WHERE token=?').get(token);
      if (existing) return existing.id;
      const id = randomBytes(24).toString('base64url');
      db.prepare('INSERT OR IGNORE INTO shared_demo_credentials(id,token) VALUES(?,?)').run(id, token);
      return db.prepare('SELECT id FROM shared_demo_credentials WHERE token=?').get(token).id;
    },
    getSharedToken,
    // A published credential, loaded from this server's storage and checked by the shared verifier.
    async getPublished(id) {
      const token = getSharedToken(id);
      if (!token) return null;
      const result = await verify(token);
      return result.status === 'verified' ? { token, payload: result.credential, result } : { valid: false };
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
        {
          name: 'Priya Sharma',
          role: 'Customer service · fictional scenario',
          credentials: [{
            title: 'Customer support practice for Durabuilt Windows & Doors (fictional scenario)',
            witness: 'Morgan',
            transcript: "In a fictional customer-service practice scenario for Durabuilt Windows & Doors, Priya listened to a homeowner's questions about window options and explained the next steps in plain language. She recorded the customer's request in a tracking sheet, clarified a concern about scheduling, and coordinated a follow-up after the appointment time changed.",
            mappings: [
              { skill: 'Communication', quote: "listened to a homeowner's questions about window options and explained the next steps in plain language" },
              { skill: 'Digital', quote: "recorded the customer's request in a tracking sheet" },
              { skill: 'Problem solving', quote: 'clarified a concern about scheduling' },
              { skill: 'Adaptability', quote: 'after the appointment time changed' },
              { skill: 'Collaboration', quote: 'coordinated a follow-up' },
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
          role: profile.role,
          skills: [...new Set(credentials.flatMap(credential => credential.payload.mappings.map(mapping => mapping.skill)))],
          links: ids.map(id => `${appOrigin}/verify/${id}`),
          credentials: credentials.map(credential => ({ token: credential.token })),
        });
      }
      return listed;
    },
    close() { db.close(); },
  };
}
