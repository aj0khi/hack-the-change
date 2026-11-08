import { skillTerms } from './skills.mjs';
import { MAX_POSTING_CHARS, runLens } from './lens.mjs';

export async function analyzePublishedCredentials({ posting, links }, { appOrigin, store, generate, model }) {
  if (typeof posting !== 'string' || !posting.trim() || posting.length > MAX_POSTING_CHARS)
    return { status: 400, body: { error: `Enter a job posting of at most ${MAX_POSTING_CHARS} characters.` } };
  if (!Array.isArray(links) || links.length < 1 || links.length > 10)
    return { status: 400, body: { error: 'Provide between 1 and 10 verification links.' } };
  const ids = [];
  for (const link of links) {
    if (typeof link !== 'string' || link.length > 2048)
      return { status: 400, body: { error: 'Each link must be a complete Proofly verification URL.' } };
    let url;
    try { url = new URL(link); } catch { return { status: 400, body: { error: 'Each link must be a complete Proofly verification URL.' } }; }
    const match = /^\/verify\/([A-Za-z0-9_-]{32})$/.exec(url.pathname);
    if (url.origin !== appOrigin || url.username || url.password || url.search || url.hash || !match)
      return { status: 400, body: { error: 'Only exact verification links from this Proofly site are supported.' } };
    if (ids.includes(match[1])) return { status: 400, body: { error: 'Remove duplicate verification links.' } };
    ids.push(match[1]);
  }
  if (!store) return { status: 503, body: { error: 'Credential verification is unavailable.' } };
  const credentials = await Promise.all(ids.map(id => store.getPublished(id)));
  if (credentials.some(c => !c)) return { status: 404, body: { error: 'A credential was not found. Check each link and try again.' } };
  if (credentials.some(c => !c.token)) return { status: 422, body: { error: 'A credential has an invalid signature. No analysis was performed.' } };
  if (new Set(credentials.map(c => c.payload.student)).size > 1)
    return { status: 400, body: { error: 'Analyze one student at a time. The submitted credentials name different students.' } };
  const sources = credentials.map(({ payload }, index) => ({
    url: `${appOrigin}/verify/${ids[index]}`, student: payload.student, title: payload.title,
    issuer: payload.issuer, witness: payload.witness,
  }));
  // Every credential was already checked by the shared verifier in store.getPublished.
  const result = await runLens({ posting, checks: credentials.map(c => c.result) }, { generate, model });
  if (result.status !== 200) return result;
  if (!result.body.fallback) return { status: 200, body: { mode: 'ai', sources, ...result.body } };
  const postingLines = posting.split(/\n+|(?<=[.!?])\s+/)
    .map(line => line.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);
  const requirements = Object.entries(skillTerms)
    .filter(([, pattern]) => pattern.test(posting))
    .map(([skill, pattern]) => {
      const context = postingLines.find(line => pattern.test(line)) || '';
      const matches = credentials.flatMap(({ payload }, index) => payload.mappings
        .filter(mapping => mapping.skill === skill)
        .map(mapping => ({ credentialId: String(index), quote: mapping.quote, skill: mapping.skill })));
      return { text: skill, context: context.length > 180 ? `${context.slice(0, 177)}…` : context, matches };
    });
  return { status: 200, body: { mode: 'offline', sources, requirements } };
}
