// Prints a new Ed25519 key pair for the demo issuer as .env lines.
// Usage: node scripts/generate-issuer-keys.mjs >> .env   (keep .env private; never commit it)
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
console.log(`DEMO_ISSUER_PRIVATE_KEY=${privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64url')}`);
console.log(`DEMO_ISSUER_PUBLIC_KEY=${publicKey.export({ type: 'spki', format: 'der' }).toString('base64url')}`);
