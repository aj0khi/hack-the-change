import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';

const codeHash = code => createHash('sha256').update(code).digest('hex');
const newCode = () => randomBytes(24).toString('base64url');
const CODE_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const CODE_LIFETIME = 24 * 60 * 60 * 1000;

export function createVerificationStore(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS accounts (
      subject TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      identity_status TEXT NOT NULL DEFAULT 'not_started',
      identity_session TEXT,
      identity_started_at INTEGER,
      identity_attempts INTEGER NOT NULL DEFAULT 0,
      identity_window_start INTEGER,
      uniqueness_status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE IF NOT EXISTS organizations (
      owner_subject TEXT PRIMARY KEY REFERENCES accounts(subject),
      legal_name TEXT NOT NULL,
      registry_reference TEXT NOT NULL,
      website TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      registry_status TEXT NOT NULL DEFAULT 'pending',
      contact_status TEXT NOT NULL DEFAULT 'pending',
      membership_status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE IF NOT EXISTS rehearsal_vouches (
      id TEXT PRIMARY KEY,
      witness_subject TEXT NOT NULL REFERENCES accounts(subject),
      student_subject TEXT REFERENCES accounts(subject),
      coordinator_subject TEXT REFERENCES accounts(subject),
      fields TEXT NOT NULL,
      status TEXT NOT NULL,
      invite_hash TEXT,
      invite_expires INTEGER,
      credential_token TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );`);

  function eligibleAccount(subject) {
    const account = db.prepare('SELECT subject, email, email_verified FROM accounts WHERE subject=?').get(subject);
    return account?.email_verified ? account : null;
  }

  function distinctAccounts(subjects) {
    const accounts = subjects.map(eligibleAccount);
    return accounts.every(Boolean) &&
      new Set(accounts.map(account => account.subject)).size === accounts.length &&
      new Set(accounts.map(account => account.email.trim().toLowerCase())).size === accounts.length;
  }

  function findInvitation(code, status, now) {
    if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return null;
    return db.prepare('SELECT * FROM rehearsal_vouches WHERE invite_hash=? AND status=? AND invite_expires>?')
      .get(codeHash(code), status, now) || null;
  }

  return {
    upsertAccount(subject, email, verified) {
      const current = db.prepare('SELECT email FROM accounts WHERE subject=?').get(subject);
      db.prepare(`INSERT INTO accounts(subject,email,email_verified) VALUES(?,?,?)
        ON CONFLICT(subject) DO UPDATE SET email=excluded.email,email_verified=excluded.email_verified`).run(subject, email, verified ? 1 : 0);
      if (current && (current.email !== email || !verified)) {
        db.prepare("UPDATE organizations SET status='pending', membership_status='pending' WHERE owner_subject=?").run(subject);
      }
    },
    account(subject) { return db.prepare('SELECT * FROM accounts WHERE subject=?').get(subject); },
    organization(subject) { return db.prepare('SELECT * FROM organizations WHERE owner_subject=?').get(subject); },
    saveOrganization(subject, organization) {
      db.prepare(`INSERT INTO organizations(owner_subject,legal_name,registry_reference,website,contact_email,contact_phone)
        VALUES(?,?,?,?,?,?) ON CONFLICT(owner_subject) DO UPDATE SET legal_name=excluded.legal_name,
        registry_reference=excluded.registry_reference,website=excluded.website,contact_email=excluded.contact_email,
        contact_phone=excluded.contact_phone,status='pending',registry_status='pending',contact_status='pending',membership_status='pending'`)
        .run(subject, organization.name, organization.registry, organization.website, organization.email, organization.phone);
    },
    reserveIdentity(subject, now) {
      const result = db.prepare(`UPDATE accounts SET identity_session=NULL, identity_status='starting', identity_started_at=?,
        identity_attempts=CASE WHEN identity_window_start IS NULL OR identity_window_start < ? THEN 1 ELSE identity_attempts+1 END,
        identity_window_start=CASE WHEN identity_window_start IS NULL OR identity_window_start < ? THEN ? ELSE identity_window_start END
        WHERE subject=? AND (identity_status NOT IN ('verified','pending','starting') OR (identity_status='starting' AND identity_started_at < ?))
        AND (identity_window_start IS NULL OR identity_window_start < ? OR identity_attempts < 3)`)
        .run(now, now - 86400000, now - 86400000, now, subject, now - 300000, now - 86400000);
      return result.changes === 1;
    },
    beginIdentity(subject, sessionId) {
      db.prepare("UPDATE accounts SET identity_session=?, identity_status='pending' WHERE subject=? AND identity_status='starting'").run(sessionId, subject);
    },
    failIdentityStart(subject) {
      db.prepare("UPDATE accounts SET identity_status='not_started' WHERE subject=? AND identity_status='starting'").run(subject);
    },
    setIdentityStatus(subject, sessionId, status) {
      db.prepare('UPDATE accounts SET identity_status=? WHERE subject=? AND identity_session=?').run(status, subject, sessionId);
    },
    createRehearsal(subject, fields, now = Date.now()) {
      if (!eligibleAccount(subject)) throw new Error('A verified email account is required.');
      const id = newCode();
      const code = newCode();
      db.prepare(`INSERT INTO rehearsal_vouches(id,witness_subject,fields,status,invite_hash,invite_expires,created_at,updated_at)
        VALUES(?,?,?,'awaiting_student',?,?,?,?)`)
        .run(id, subject, JSON.stringify(fields), codeHash(code), now + CODE_LIFETIME, now, now);
      return { id, code };
    },
    inspectRehearsal(subject, code, role, now = Date.now()) {
      const status = role === 'student' ? 'awaiting_student' : role === 'coordinator' ? 'awaiting_coordinator' : null;
      if (!status) return null;
      const row = findInvitation(code, status, now);
      if (!row) return null;
      const participants = role === 'student' ? [row.witness_subject, subject] : [row.witness_subject, row.student_subject, subject];
      if (!distinctAccounts(participants)) return null;
      return { id: row.id, fields: JSON.parse(row.fields), status: row.status };
    },
    acceptRehearsal(subject, code, now = Date.now()) {
      const row = findInvitation(code, 'awaiting_student', now);
      if (!row || !distinctAccounts([row.witness_subject, subject])) return null;
      const coordinatorCode = newCode();
      const result = db.prepare(`UPDATE rehearsal_vouches SET student_subject=?,status='awaiting_coordinator',
        invite_hash=?,invite_expires=?,updated_at=? WHERE id=? AND status='awaiting_student' AND invite_hash=? AND invite_expires>?`)
        .run(subject, codeHash(coordinatorCode), now + CODE_LIFETIME, now, row.id, codeHash(code), now);
      return result.changes === 1 ? { id: row.id, code: coordinatorCode } : null;
    },
    reserveRehearsal(subject, code, now = Date.now()) {
      const row = findInvitation(code, 'awaiting_coordinator', now);
      if (!row || !distinctAccounts([row.witness_subject, row.student_subject, subject])) return null;
      const result = db.prepare(`UPDATE rehearsal_vouches SET coordinator_subject=?,status='signing',updated_at=?
        WHERE id=? AND status='awaiting_coordinator' AND invite_hash=? AND invite_expires>?`)
        .run(subject, now, row.id, codeHash(code), now);
      return result.changes === 1 ? { id: row.id, fields: JSON.parse(row.fields) } : null;
    },
    completeRehearsal(id, subject, token, now = Date.now()) {
      const row = db.prepare("SELECT witness_subject,student_subject,coordinator_subject FROM rehearsal_vouches WHERE id=? AND status='signing' AND coordinator_subject=?").get(id, subject);
      if (!row || !distinctAccounts([row.witness_subject, row.student_subject, row.coordinator_subject])) return false;
      return db.prepare(`UPDATE rehearsal_vouches SET status='issued',credential_token=?,invite_hash=NULL,invite_expires=NULL,updated_at=?
        WHERE id=? AND coordinator_subject=? AND status='signing'`).run(token, now, id, subject).changes === 1;
    },
    releaseRehearsal(id, subject, now = Date.now()) {
      db.prepare(`UPDATE rehearsal_vouches SET status='awaiting_coordinator',coordinator_subject=NULL,updated_at=?
        WHERE id=? AND coordinator_subject=? AND status='signing'`).run(now, id, subject);
    },
    listRehearsals(subject) {
      return db.prepare(`SELECT id, witness_subject, student_subject, coordinator_subject, fields, status, credential_token, created_at, updated_at
        FROM rehearsal_vouches WHERE witness_subject=? OR student_subject=? OR coordinator_subject=? ORDER BY created_at DESC LIMIT 50`)
        .all(subject, subject, subject).map(row => ({
          id: row.id, fields: JSON.parse(row.fields), status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
          role: row.witness_subject === subject ? 'witness' : row.student_subject === subject ? 'student' : 'coordinator',
          ...(row.student_subject === subject && row.status === 'issued' ? { token: row.credential_token } : {}),
        }));
    },
    close() { db.close(); },
  };
}