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
    const mappings = input?.mappings;
    if (!title || !witness || !transcript || !Array.isArray(mappings) || mappings.length < 1 || mappings.length > 9 ||
      mappings.some(m => !m || !Object.hasOwn(skillTerms, m.skill) || typeof m.quote !== 'string' || !m.quote.trim() || !transcript.includes(m.quote))) {
      throw new TypeError('Provide a project, witness, transcript, and supported skills grounded in the transcript.');
    }
    // The issuer name is not taken from the request (or signed at all): verification shows the registry name.
    return { title, witness, transcript, student: 'Priya Sharma', example: input.example === true, mappings: mappings.map(({ skill, quote }) => ({ skill, quote })) };
  }

  return {
    issuerId: DEMO_ISSUER.issuerId,
    issuerName: DEMO_ISSUER.name,
    keySource: signing.source,
    trustedIssuers,
    verify,
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
    // The authoritative stored token for a share link (verify it with `verify`), or null.
    getSharedToken(id) {
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(id)) return null;
      return db.prepare('SELECT token FROM shared_demo_credentials WHERE id=?').get(id)?.token ?? null;
    },
    close() { db.close(); },
  };
}
