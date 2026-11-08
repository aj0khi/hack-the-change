import express from 'express';
import { randomBytes } from 'node:crypto';
import { linkedinCaption } from './linkedin-caption.mjs';

const lifetime = 10 * 60 * 1000;
const randomId = () => randomBytes(32).toString('base64url');
const cookieValue = (request, name) => request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);

export function createLinkedInRouter({ config, demoCredentials, fetcher = fetch }) {
  const router = express.Router();
  const pending = new Map();
  const sessions = new Map();
  const enabled = Boolean(config.appOrigin && config.linkedinClientId && config.linkedinClientSecret && demoCredentials);
  const secure = config.appOrigin?.startsWith('https://') === true;
  const callback = `${config.appOrigin}/api/linkedin/callback`;
  const cookieScope = { httpOnly: true, secure, sameSite: 'lax', path: '/api/linkedin' };
  const cookieOptions = { ...cookieScope, maxAge: lifetime };
  const prune = () => {
    for (const map of [pending, sessions]) {
      for (const [key, value] of map) if (value.expires <= Date.now()) map.delete(key);
    }
  };
  const requestLinkedIn = async (url, options = {}) => {
    const response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`LinkedIn returned HTTP ${response.status}`);
    return response;
  };
  const callbackPage = (response, status) => response
    .set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" })
    .type('html').send(`<!doctype html><title>LinkedIn connection</title><p>You can close this window and return to Proofly.</p><script>if(window.opener){window.opener.postMessage({type:'proofly-linkedin',status:'${status}'},${JSON.stringify(config.appOrigin)});window.close()}</script>`);

  router.get('/status', (request, response) => {
    prune();
    const session = sessions.get(cookieValue(request, 'proofly_linkedin'));
    response.json({ enabled, connected: Boolean(session), name: session?.name || null });
  });
  router.get('/connect', (request, response) => {
    if (!enabled) return response.status(503).send('LinkedIn sharing is not configured.');
    prune();
    if (pending.size >= 1000) return response.status(503).send('Too many LinkedIn connections in progress. Try again later.');
    const state = randomId();
    pending.set(state, { expires: Date.now() + lifetime });
    response.cookie('proofly_linkedin_state', state, cookieOptions);
    const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
    url.search = new URLSearchParams({ response_type: 'code', client_id: config.linkedinClientId, redirect_uri: callback, state, scope: 'openid profile w_member_social' });
    response.set('Cache-Control', 'no-store').redirect(url.toString());
  });
  router.get('/callback', async (request, response) => {
    response.clearCookie('proofly_linkedin_state', cookieScope);
    prune();
    const state = request.query.state;
    if (typeof state !== 'string' || state !== cookieValue(request, 'proofly_linkedin_state') || !pending.has(state)) return response.status(400).send('LinkedIn connection expired or could not be verified. Please try again.');
    pending.delete(state);
    if (request.query.error || typeof request.query.code !== 'string') return callbackPage(response, 'denied');
    try {
      const tokenResponse = await requestLinkedIn('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: request.query.code, client_id: config.linkedinClientId, client_secret: config.linkedinClientSecret, redirect_uri: callback }),
      });
      const token = await tokenResponse.json();
      if (typeof token.access_token !== 'string' || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw new Error('Invalid LinkedIn token response');
      const profile = await (await requestLinkedIn('https://api.linkedin.com/v2/userinfo', { headers: { authorization: `Bearer ${token.access_token}` } })).json();
      if (typeof profile.sub !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(profile.sub)) throw new Error('Invalid LinkedIn member response');
      if (sessions.size >= 1000) throw new Error('Too many LinkedIn sessions');
      const id = randomId();
      sessions.delete(cookieValue(request, 'proofly_linkedin'));
      const sessionLifetime = Math.min(lifetime, token.expires_in * 1000);
      sessions.set(id, { token: token.access_token, author: `urn:li:person:${profile.sub}`, name: typeof profile.name === 'string' ? profile.name.slice(0, 100) : null, expires: Date.now() + sessionLifetime });
      setTimeout(() => sessions.delete(id), sessionLifetime).unref();
      response.cookie('proofly_linkedin', id, cookieOptions);
      return callbackPage(response, 'connected');
    } catch (error) {
      console.error('[linkedin] connection failed:', error.message);
      return callbackPage(response, 'error');
    }
  });
  router.post('/disconnect', (request, response) => {
    if (request.headers.origin !== config.appOrigin) return response.status(403).json({ error: 'Request origin not allowed.' });
    const id = cookieValue(request, 'proofly_linkedin');
    if (sessions.get(id)?.busy) return response.status(409).json({ error: 'Wait for the post to finish before disconnecting.' });
    sessions.delete(id);
    response.clearCookie('proofly_linkedin', cookieScope);
    return response.json({ disconnected: true });
  });
  router.post('/post', express.json({ limit: '2mb' }), async (request, response) => {
    if (request.headers.origin !== config.appOrigin) return response.status(403).json({ error: 'Request origin not allowed.' });
    if (!enabled) return response.status(503).json({ error: 'LinkedIn sharing is not configured.' });
    prune();
    const sessionId = cookieValue(request, 'proofly_linkedin');
    const session = sessions.get(sessionId);
    if (!session) return response.status(401).json({ error: 'Connect LinkedIn again before posting.' });
    if (session.busy) return response.status(409).json({ error: 'A post is already in progress.' });
    const { id, image } = request.body || {};
    if (typeof id !== 'string' || typeof image !== 'string' || image.length > 1800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) return response.status(400).json({ error: 'Invalid credential or image.' });
    const bytes = Buffer.from(image, 'base64');
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return response.status(400).json({ error: 'The credential image must be a PNG.' });
    session.busy = true;
    let posting = false;
    try {
      const credential = await demoCredentials.get(id);
      if (!credential?.valid) return response.status(400).json({ error: 'The published demo credential is invalid or unavailable.' });
      const auth = { authorization: `Bearer ${session.token}`, 'X-Restli-Protocol-Version': '2.0.0' };
      const registered = await (await requestLinkedIn('https://api.linkedin.com/v2/assets?action=registerUpload', {
        method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ registerUploadRequest: { recipes: ['urn:li:digitalmediaRecipe:feedshare-image'], owner: session.author, serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }] } }),
      })).json();
      const asset = registered.value?.asset;
      const uploadUrl = new URL(registered.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl);
      if (uploadUrl.protocol !== 'https:' || !['api.linkedin.com', 'www.linkedin.com'].includes(uploadUrl.hostname) || uploadUrl.port || uploadUrl.username || uploadUrl.password || !/^urn:li:digitalmediaAsset:[A-Za-z0-9_-]+$/.test(asset)) throw new Error('Invalid LinkedIn upload response');
      await requestLinkedIn(uploadUrl, { method: 'PUT', headers: { ...auth, 'content-type': 'image/png' }, body: bytes });
      const text = linkedinCaption(credential.payload, `${config.appOrigin}/verify/${id}`);
      posting = true;
      await requestLinkedIn('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ author: session.author, lifecycleState: 'PUBLISHED', specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text }, shareMediaCategory: 'IMAGE', media: [{ status: 'READY', media: asset, description: { text: 'Proofly fictional demo credential with verification QR code' } }] } }, visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' } }),
      });
      sessions.delete(sessionId);
      response.clearCookie('proofly_linkedin', cookieScope);
      return response.json({ posted: true });
    } catch (error) {
      console.error('[linkedin] sharing failed:', error.message);
      if (posting) {
        sessions.delete(sessionId);
        response.clearCookie('proofly_linkedin', cookieScope);
        return response.status(502).json({ error: 'LinkedIn did not confirm the post. Check your LinkedIn profile before trying again to avoid duplicates.' });
      }
      return response.status(502).json({ error: 'Could not prepare the LinkedIn post. Please try again.' });
    } finally { session.busy = false; }
  });
  router.use((error, _request, response, _next) => {
    if (error.type === 'entity.too.large') return response.status(413).json({ error: 'The image is too large to share.' });
    if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'Invalid sharing request.' });
    console.error('[linkedin] request failed:', error.message);
    return response.status(500).json({ error: 'LinkedIn sharing is unavailable.' });
  });
  return router;
}
