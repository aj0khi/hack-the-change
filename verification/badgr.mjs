const regions = {
  canada: 'api.badges.parchment.ca',
  us: 'api.badges.parchment.com',
  legacy: 'api.badgr.io',
};

export async function inspectBadgrAssertion({ region, assertionId }, fetcher = fetch, now = Date.now()) {
  const host = regions[region];
  if (!host || typeof assertionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(assertionId)) {
    throw new Error('Choose a supported region and enter a valid assertion ID.');
  }
  const url = `https://${host}/public/assertions/${assertionId}`;
  let response;
  try {
    response = await fetcher(url, { headers: { accept: 'application/ld+json, application/json' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
  } catch {
    throw new Error('The badge provider could not be reached.');
  }
  if (response.status === 410) return { status: 'revoked', source: url };
  if (response.status === 404) return { status: 'not_found', source: url };
  if (!response.ok) throw new Error('The badge provider did not return a public assertion.');
  if (!/^application\/(?:ld\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('The badge provider returned an unsupported response.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The badge provider returned an empty response.');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 131072) throw new Error('The badge provider response is too large.');
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let assertion;
  try { assertion = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('The badge provider returned invalid JSON.'); }
  const types = Array.isArray(assertion?.type) ? assertion.type : [assertion?.type];
  const methods = Array.isArray(assertion?.verification?.type) ? assertion.verification.type : [assertion?.verification?.type];
  if (!types.includes('Assertion') || !methods.some(method => method === 'HostedBadge' || method === 'hosted') || assertion.id !== url || (assertion.revoked !== undefined && typeof assertion.revoked !== 'boolean')) {
    throw new Error('The response is not a supported hosted Badgr assertion.');
  }
  if (assertion.revoked === true) return { status: 'revoked', source: url };
  if (assertion.expires != null && (typeof assertion.expires !== 'string' || !Number.isFinite(Date.parse(assertion.expires)))) throw new Error('The assertion contains an invalid expiry date.');
  if (assertion.expires && Date.parse(assertion.expires) <= now) return { status: 'expired', source: url };
  const badge = assertion.badge && typeof assertion.badge === 'object' && !Array.isArray(assertion.badge) ? assertion.badge : null;
  return {
    status: 'found',
    source: url,
    badgeName: typeof badge?.name === 'string' ? badge.name.slice(0, 200) : null,
    issuedOn: typeof assertion.issuedOn === 'string' ? assertion.issuedOn.slice(0, 100) : null,
    expires: assertion.expires || null,
  };
}