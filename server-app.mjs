import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inspectBadgrAssertion } from './verification/badgr.mjs';
import { runLens } from './lens/lens.mjs';
import { projects } from './lens/projects.mjs';
import QRCode from 'qrcode';

const root = dirname(fileURLToPath(import.meta.url));
const LENS_CACHE_MAX = 100;

// Exact URL → file map for the browser. Nothing else on disk is served.
const STATIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/styles.css': 'styles.css',
  '/robots.txt': 'robots.txt',
  '/proofly-share-preview.png': 'proofly-share-preview.png',
  '/app.js': 'app.js',
  '/trust.mjs': 'trust.mjs',
  '/lens/lens.css': 'lens/lens.css',
  '/lens/projects.mjs': 'lens/projects.mjs',
  '/lens/skills.mjs': 'lens/skills.mjs',
  '/lens/student-pathway.mjs': 'lens/student-pathway.mjs',
  '/verification/verification-ui.mjs': 'verification/verification-ui.mjs',
  '/verification/share-card.mjs': 'verification/share-card.mjs',
  '/verification/linkedin-caption.mjs': 'verification/linkedin-caption.mjs',
  '/vendor/auth0.js': 'node_modules/@auth0/auth0-spa-js/dist/auth0-spa-js.production.js',
};

function safeText(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength ? value.trim() : null;
}

function publicStatus(store, subject) {
  const account = store.account(subject);
  const organization = store.organization(subject);
  return {
    email: account.email,
    emailVerified: Boolean(account.email_verified),
    identityStatus: account.identity_status,
    uniquenessStatus: account.uniqueness_status,
    organization: organization ? {
      name: organization.legal_name,
      status: organization.status,
      registryStatus: organization.registry_status,
      contactStatus: organization.contact_status,
      membershipStatus: organization.membership_status,
    } : null,
  };
}

/**
 * lens: { generate, model } — generate is null without AI credentials (the lens then falls back offline).
 * getJobs: async () => Adzuna snapshot for /api/jobs.
 * lensCache / onLensCacheChange: saved lens answers keyed by request, so re-runs don't spend model quota.
 */
export function createApp({ config, store, demoCredentials, authenticate, getUserInfo, stripe, badgeFetcher, lens = {}, getJobs, lensCache = new Map(), onLensCacheChange }) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false }));

  // Employer Lens: registered before the global 8kb parser because a full posting plus signed
  // credentials is larger. Identical posting + credentials reuse the last good answer.
  app.post('/api/lens',
    rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false }),
    express.json({ limit: '256kb' }),
    async (request, response) => {
      try {
        const body = request.body || {};
        const key = createHash('sha256').update(JSON.stringify([body.posting, body.credentials, body.issuerPublicKey, projects])).digest('hex');
        const hit = lensCache.get(key);
        if (hit) return response.json({ ...hit, cached: true });
        const result = await runLens(body, { generate: lens.generate, model: lens.model });
        if (result.status === 200 && !result.body.fallback) {
          lensCache.set(key, result.body);
          if (lensCache.size > LENS_CACHE_MAX) lensCache.delete(lensCache.keys().next().value);
          onLensCacheChange?.(lensCache);
        }
        response.status(result.status).json(result.body);
      } catch { response.json({ fallback: true }); }
    });
  app.get('/api/jobs', async (_request, response) => {
    try { response.json(getJobs ? await getJobs() : { jobs: [], fetchedAt: null, source: 'none' }); }
    catch { response.json({ jobs: [], fetchedAt: null, source: 'none' }); }
  });

  app.use(express.json({ limit: '8kb' }));
  app.get('/api/demo-credentials/issuer', (_request, response) => {
    if (!demoCredentials) return response.status(503).json({ error: 'Demo signing is unavailable.' });
    response.json({ publicKey: demoCredentials.publicKey });
  });
  app.post('/api/demo-credentials/issue', async (request, response) => {
    if (!demoCredentials) return response.status(503).json({ error: 'Demo signing is unavailable.' });
    try { response.status(201).json({ token: await demoCredentials.issue(request.body) }); }
    catch (error) {
      if (error instanceof TypeError) return response.status(400).json({ error: error.message });
      console.error('[demo credentials] signing failed:', error);
      response.status(503).json({ error: 'Could not sign the demo credential.' });
    }
  });
  app.post('/api/demo-credentials/share', async (request, response) => {
    if (!demoCredentials) return response.status(503).json({ error: 'Demo sharing is unavailable.' });
    try {
      const id = await demoCredentials.publish(request.body?.token);
      if (!id) return response.status(400).json({ error: 'Only valid server-signed demo credentials can be shared.' });
      response.json({ url: `${config.appOrigin}/verify/${id}`, qrUrl: `/verify/${id}/qr.png` });
    } catch (error) {
      console.error('[demo credentials] sharing failed:', error);
      response.status(503).json({ error: 'Could not share the demo credential.' });
    }
  });
  app.get('/api/config', (_request, response) => response.json({
    enabled: Boolean(authenticate && getUserInfo),
    identityEnabled: Boolean(stripe),
    auth0Domain: config.auth0Domain || null,
    auth0ClientId: config.auth0ClientId || null,
    auth0Audience: config.auth0Audience || null,
  }));
  app.get('/healthz', (_request, response) => response.json({ status: 'ok' }));

  app.get('/verify/:id/qr.png', async (request, response) => {
    if (!demoCredentials) return response.status(503).send('Demo verification is unavailable.');
    try {
      const result = await demoCredentials.get(request.params.id);
      if (!result) return response.status(404).send('Credential not found.');
      if (!result.valid) return response.status(422).send('Credential signature is invalid.');
      response.set('Cache-Control', 'no-store').type('png');
      return response.send(await QRCode.toBuffer(`${config.appOrigin}/verify/${request.params.id}`, { width: 320, margin: 2 }));
    } catch (error) {
      console.error('[demo credentials] QR generation failed:', error);
      return response.status(503).send('Could not generate the QR code.');
    }
  });
  app.get('/verify/:id', async (request, response) => {
    if (!demoCredentials) return response.status(503).send('Demo verification is unavailable.');
    try {
      const result = await demoCredentials.get(request.params.id);
      if (!result) return response.status(404).send('Credential not found.');
      response.set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' });
      if (!result.valid) return response.status(422).type('html').send('<!doctype html><title>Invalid credential</title><h1>Signature invalid</h1><p>This credential could not be verified.</p>');
      const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
      const p = result.payload;
      const metadata = `<meta property="og:type" content="website"><meta property="og:title" content="Proofly | Fictional demo credential"><meta property="og:description" content="Explore a fictional skills credential and check its demo signature on Proofly."><meta property="og:url" content="${escape(`${config.appOrigin}/verify/${request.params.id}`)}"><meta property="og:image" content="${escape(`${config.appOrigin}/proofly-share-preview.png`)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Proofly fictional demo credential">`;
      return response.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verify demo credential | Proofly</title>${metadata}<style>body{margin:0;background:#f7f4f9;color:#30273a;font:16px/1.6 system-ui,sans-serif}main{max-width:620px;margin:6vh auto;padding:24px}article{background:white;border:1px solid #e5dfeb;border-radius:20px;padding:clamp(22px,6vw,42px);box-shadow:0 12px 40px #362a4512}h1{font-size:clamp(26px,6vw,36px);line-height:1.15}.eyebrow{letter-spacing:.12em;font-size:12px;font-weight:700;color:#685576}.status{background:#eee9f6;color:#453455;border-radius:10px;padding:12px;font-weight:700}blockquote{margin:24px 0;padding:16px;border-left:3px solid #a68fc0;background:#f8f5fb}dt{font-weight:700}dd{margin:0 0 12px}.note{font-size:14px;color:#62586c}</style></head><body><main><p class="eyebrow">PROOFLY · PUBLIC DEMO CREDENTIAL</p><article><h1>${escape(p.title)}</h1><p class="status">Signature valid ✓</p><p class="note">Checked against this server's demo issuer key on this visit.</p><blockquote>“${escape(p.transcript)}”<br>— ${escape(p.witness)}, demo witness</blockquote><dl><dt>Student</dt><dd>${escape(p.student)}</dd><dt>Issuing organization</dt><dd>${escape(p.issuer)}</dd><dt>Skills</dt><dd>${p.mappings.map(m => escape(m.skill)).join(', ')}</dd><dt>Issued</dt><dd>${escape(p.issuedAt)}</dd></dl><p class="note">Fictional demo only. A valid signature shows that this server signed these words and they have not changed; it does not verify the witness, organization, or truth of the work. Not an employment credential.</p></article></main></body></html>`);
    } catch (error) {
      console.error('[demo credentials] verification failed:', error);
      return response.status(503).send('Could not verify the demo credential.');
    }
  });

  app.post('/api/badgr/assertion', async (request, response) => {
    try {
      const result = await inspectBadgrAssertion(request.body || {}, badgeFetcher || fetch);
      response.json(result);
    } catch (error) {
      response.status(422).json({ error: error.message });
    }
  });

  app.use('/api/account', (request, response, next) => {
    if (!authenticate || !getUserInfo) return response.status(503).json({ error: 'Account verification is not configured.' });
    return authenticate(request, response, next);
  }, async (request, response, next) => {
    try {
      const profile = await getUserInfo(request.auth.token);
      if (!profile || profile.sub !== request.auth.payload.sub || !profile.email) {
        return response.status(403).json({ error: 'Unable to confirm your account identity.' });
      }
      if (profile.email_verified !== true) {
        store.upsertAccount(profile.sub, profile.email, false);
        return response.status(403).json({ error: 'Verify your account email with Auth0 first.' });
      }
      request.subject = profile.sub;
      store.upsertAccount(profile.sub, profile.email, true);
      return next();
    } catch { return response.status(503).json({ error: 'Unable to confirm your account. Try again.' }); }
  });

  app.get('/api/account', (request, response) => response.json(publicStatus(store, request.subject)));

  app.post('/api/account/identity', async (request, response) => {
    if (!stripe) return response.status(503).json({ error: 'Identity verification is not configured.' });
    const account = store.account(request.subject);
    if (account.identity_status === 'verified') return response.status(409).json({ error: 'Identity verification has already completed.' });
    try {
      if (account.identity_session && ['pending', 'needs_input'].includes(account.identity_status)) {
        const existing = await stripe.identity.verificationSessions.retrieve(account.identity_session);
        if (existing.id !== account.identity_session || existing.client_reference_id !== request.subject || existing.type !== 'document' || existing.options?.document?.require_matching_selfie !== true) return response.status(403).json({ error: 'Verification session does not match your account or required checks.' });
        if (existing.status === 'requires_input' && existing.url && account.identity_started_at && Date.now() - account.identity_started_at < 47 * 60 * 60 * 1000) return response.json({ url: existing.url });
        if (existing.status !== 'requires_input' && existing.status !== 'canceled') return response.status(409).json({ error: 'Your verification is being processed. Refresh your status.' });
        store.setIdentityStatus(request.subject, existing.id, 'not_started');
      }
      const now = Date.now();
      if (!store.reserveIdentity(request.subject, now)) return response.status(429).json({ error: 'Identity verification is already starting or its attempt limit was reached. Try again later.' });
      const session = await stripe.identity.verificationSessions.create({
        type: 'document',
        client_reference_id: request.subject,
        options: { document: { require_matching_selfie: true } },
        return_url: `${config.appOrigin}/#verification`,
      });
      if (!session.url) { store.failIdentityStart(request.subject); return response.status(503).json({ error: 'The identity provider did not return a verification link.' }); }
      store.beginIdentity(request.subject, session.id);
      response.json({ url: session.url });
    } catch { store.failIdentityStart(request.subject); response.status(503).json({ error: 'Could not start identity verification. Try again later.' }); }
  });

  app.post('/api/account/identity/refresh', async (request, response) => {
    if (!stripe) return response.status(503).json({ error: 'Identity verification is not configured.' });
    const account = store.account(request.subject);
    if (!account.identity_session) return response.status(409).json({ error: 'No identity verification has been started.' });
    try {
      const session = await stripe.identity.verificationSessions.retrieve(account.identity_session);
      if (session.id !== account.identity_session || session.client_reference_id !== request.subject || session.type !== 'document' || session.options?.document?.require_matching_selfie !== true) return response.status(403).json({ error: 'Verification session does not match your account or required checks.' });
      const status = session.status === 'verified' ? (session.livemode ? 'verified' : 'test_verified') : session.status === 'canceled' ? 'not_started' : session.status === 'requires_input' ? 'needs_input' : 'pending';
      store.setIdentityStatus(request.subject, session.id, status);
      response.json(publicStatus(store, request.subject));
    } catch { response.status(503).json({ error: 'Unable to check identity verification. Try again.' }); }
  });

  app.post('/api/account/organization', (request, response) => {
    const name = safeText(request.body.name, 150);
    const registry = safeText(request.body.registry, 150);
    const website = safeText(request.body.website, 500);
    const email = safeText(request.body.email, 254);
    const phone = safeText(request.body.phone, 40);
    let validWebsite = false;
    try { const url = new URL(website); validWebsite = url.protocol === 'https:' && !url.username && !url.password; } catch { /* Invalid URL. */ }
    if (!name || !registry || !validWebsite || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone) return response.status(400).json({ error: 'Enter the legal name, registry reference, HTTPS website, contact email, and phone.' });
    store.saveOrganization(request.subject, { name, registry, website, email, phone });
    response.status(202).json(publicStatus(store, request.subject));
  });

  app.use('/api', (_request, response) => response.status(404).json({ error: 'Not found' }));
  app.use('/api', (error, _request, response, _next) => {
    if (error.status === 401 || error.status === 403) return response.status(error.status).json({ error: 'Sign in with a valid account.' });
    return response.status(500).json({ error: 'Verification service unavailable.' });
  });

  for (const [path, file] of Object.entries(STATIC_FILES)) {
    app.get(path, (_request, response) => response.sendFile(join(root, file)));
  }
  return app;
}
