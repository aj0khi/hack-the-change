import { DatabaseSync } from 'node:sqlite';

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
    );`);

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
    close() { db.close(); },
  };
}