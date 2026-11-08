// Entry file. Starts listening as soon as it is imported (Hostinger imports it rather than running it),
// so keep everything here at top level. Routes live in server-app.mjs.
import { auth } from 'express-oauth2-jwt-bearer';
import Stripe from 'stripe';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createApp } from './server-app.mjs';
import { createVerificationStore } from './verification/verification-store.mjs';
import { createBedrockGenerator, DEFAULT_BEDROCK_MODEL, DEFAULT_BEDROCK_REGION } from './lens/bedrock.mjs';
import { loadJobs } from './lens/adzuna.mjs';
import { createDemoCredentialStore } from './verification/demo-credentials.mjs';

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
const store = createVerificationStore(process.env.VERIFICATION_DB || join(root, 'verification', 'verification.sqlite'));
const demoCredentials = await createDemoCredentialStore(process.env.DEMO_CREDENTIAL_DB || join(root, 'data', 'demo-credentials.sqlite'));

// Employer Lens: AI model, Calgary jobs (cached in data/), and saved lens answers (data/lens-cache.json).
const model = process.env.BEDROCK_MODEL_ID || DEFAULT_BEDROCK_MODEL;
const generate = await createBedrockGenerator({ modelId: model, region: process.env.AWS_REGION || DEFAULT_BEDROCK_REGION });
if (!generate) console.warn('[lens] No AWS credentials set; the lens will use offline keyword matching.');
const jobsReady = loadJobs({ appId: process.env.ADZUNA_APP_ID, appKey: process.env.ADZUNA_APP_KEY, cachePath: join(root, 'data', 'adzuna-cache.json') });
const lensCachePath = join(root, 'data', 'lens-cache.json');
let lensCache = new Map();
try { lensCache = new Map(Object.entries(JSON.parse(readFileSync(lensCachePath, 'utf8')))); } catch { /* No saved results yet. */ }
let saveTimer;
const onLensCacheChange = cache => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    mkdir(dirname(lensCachePath), { recursive: true })
      .then(() => writeFile(lensCachePath, JSON.stringify(Object.fromEntries(cache))))
      .catch(error => console.warn(`[lens] could not save results: ${error.message}`));
  }, 500);
};

createApp({ config, store, demoCredentials, authenticate, getUserInfo, stripe, lens: { generate, model }, getJobs: () => jobsReady, lensCache, onLensCacheChange })
  .listen(port, '0.0.0.0', () => console.log(`Proofly server listening on port ${port} (${appOrigin})`));
