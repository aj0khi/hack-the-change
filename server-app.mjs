import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inspectBadgrAssertion } from './badgr.mjs';

const root = dirname(fileURLToPath(import.meta.url));

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

export function createApp({ config, store, authenticate, getUserInfo, stripe, badgeFetcher }) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false }));
  app.use(express.json({ limit: '8kb' }));
  app.get('/api/config', (_request, response) => response.json({
    enabled: Boolean(authenticate && getUserInfo),
    identityEnabled: Boolean(stripe),
    auth0Domain: config.auth0Domain || null,
    auth0ClientId: config.auth0ClientId || null,
    auth0Audience: config.auth0Audience || null,
  }));
  app.get('/healthz', (_request, response) => response.json({ status: 'ok' }));

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

  app.use('/api', (error, _request, response, _next) => {
    if (error.status === 401 || error.status === 403) return response.status(error.status).json({ error: 'Sign in with a valid account.' });
    return response.status(500).json({ error: 'Verification service unavailable.' });
  });

  for (const file of ['index.html', 'styles.css', 'app.js', 'trust.mjs', 'verification-ui.mjs']) {
    app.get(file === 'index.html' ? ['/', '/index.html'] : `/${file}`, (_request, response) => response.sendFile(join(root, file)));
  }
  app.get('/vendor/auth0.js', (_request, response) => response.sendFile(join(root, 'node_modules/@auth0/auth0-spa-js/dist/auth0-spa-js.production.js')));
  return app;
}