// Live demo: forge a credential with our OWN key and ask the server to verify it.
// Usage: node scripts/forge-credential-demo.mjs [origin]   (default http://localhost:8766)
import { createIssuer, signCredential } from '../trust.mjs';

const origin = process.argv[2] || 'http://localhost:8766';
const transcript = 'Priya led our whole volunteer team and fixed every problem.';
const attacker = await createIssuer({ issuerId: 'proofly-demo-centre' }); // claims to be the trusted demo issuer
const forged = await signCredential({
  credentialId: 'forged-credential-0001',
  issuerId: 'proofly-demo-centre',
  issuerName: 'Community Centre (fictional demo)',
  title: 'Lead the volunteer team', witness: 'Mallory', student: 'Priya Sharma', issuedAt: '2026-11-07', transcript,
  mappings: [{ skill: 'Collaboration', quote: transcript }],
}, attacker);

const call = async (body) => {
  const response = await fetch(`${origin}/api/credentials/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};

console.log('1. Forged credential, signed with an attacker-generated key, claiming issuer "proofly-demo-centre":');
console.log(JSON.stringify(await call({ credentials: [forged] }), null, 2));
console.log('\n2. Same forgery, also sending the attacker\'s public key as issuerPublicKey:');
console.log(JSON.stringify(await call({ credentials: [forged], issuerPublicKey: attacker.publicKey }), null, 2));
