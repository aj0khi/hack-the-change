import { auth } from 'express-oauth2-jwt-bearer';
import Stripe from 'stripe';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from './server-app.mjs';
import { createVerificationStore } from './verification-store.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8766);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const appOrigin = process.env.APP_ORIGIN || `http://localhost:${port}`;
const parsedOrigin = new URL(appOrigin);
if (parsedOrigin.origin !== appOrigin || !(parsedOrigin.protocol === 'https:' || (parsedOrigin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsedOrigin.hostname)))) throw new Error('APP_ORIGIN must be an HTTPS origin or a localhost HTTP origin.');
const auth0Domain = process.env.AUTH0_DOMAIN;
if (auth0Domain && !/^[a-zA-Z0-9.-]+$/.test(auth0Domain)) throw new Error('AUTH0_DOMAIN must be a hostname.');
const config = { appOrigin, auth0Domain, auth0ClientId: process.env.AUTH0_CLIENT_ID, auth0Audience: process.env.AUTH0_AUDIENCE };
const configured = auth0Domain && config.auth0ClientId && config.auth0Audience;
const authenticate = configured ? auth({ audience: config.auth0Audience, issuerBaseURL: `https://${auth0Domain}/`, tokenSigningAlg: 'RS256' }) : null;
const getUserInfo = configured ? async token => {
  const result = await fetch(`https://${auth0Domain}/userinfo`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  if (!result.ok) throw new Error('User info unavailable');
  return result.json();
} : null;
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const store = createVerificationStore(process.env.VERIFICATION_DB || join(root, 'verification.sqlite'));
createApp({ config, store, authenticate, getUserInfo, stripe }).listen(port, '0.0.0.0', () => console.log(`Proofly server listening on port ${port} (${appOrigin})`));
