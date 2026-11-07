// Vouch YYC server (plain node:http): static files + POST /api/lens (Gemini) + GET /api/jobs (Adzuna cache).
// Keys stay here, never in the browser. Lens code lives in lens/, the parked verification feature in verification/.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runLens } from "./lens/lens.mjs";
import { createGeminiGenerator } from "./lens/gemini.mjs";
import { loadJobs } from "./lens/adzuna.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 512 * 1024;
const LENS_PER_MINUTE = 20;
const LENS_CACHE_MAX = 100;

// Exact URL → file map: nothing outside this list is ever served.
const STATIC = {
  "/": "index.html",
  "/index.html": "index.html",
  "/app.js": "app.js",
  "/styles.css": "styles.css",
  "/trust.mjs": "trust.mjs",
  "/lens/lens.css": "lens/lens.css",
  "/lens/projects.mjs": "lens/projects.mjs",
  "/lens/skills.mjs": "lens/skills.mjs",
  "/verification/verification-ui.mjs": "verification/verification-ui.mjs",
  "/vendor/auth0.js": "node_modules/@auth0/auth0-spa-js/dist/auth0-spa-js.production.js",
};
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

/**
 * Builds the HTTP server without listening, so tests can start it on a random port.
 * - lens: { generate, model } — generate is null when no Gemini key is set (lens falls back offline).
 * - getJobs: async () => Adzuna snapshot for /api/jobs.
 * - lensCache / onLensCacheChange: saved lens answers keyed by request, so re-runs don't spend Gemini quota.
 */
export function createLensServer({ lens = {}, getJobs, lensCache = new Map(), onLensCacheChange } = {}) {
  let windowStart = Date.now();
  let lensCalls = 0;

  async function handleLens(req, res) {
    const body = await readJson(req);
    // Identical posting + credentials → reuse the last good answer. Fallbacks are never saved.
    const key = createHash("sha256").update(JSON.stringify([body?.posting, body?.credentials, body?.issuerPublicKey])).digest("hex");
    const hit = lensCache.get(key);
    if (hit) return send(res, 200, { ...hit, cached: true });
    if (Date.now() - windowStart > 60_000) {
      windowStart = Date.now();
      lensCalls = 0;
    }
    if (++lensCalls > LENS_PER_MINUTE) return send(res, 429, { error: "Too many lens requests. Try again in a minute." });
    const result = await runLens(body || {}, { generate: lens.generate, model: lens.model });
    if (result.status === 200 && !result.body.fallback) {
      lensCache.set(key, result.body);
      if (lensCache.size > LENS_CACHE_MAX) lensCache.delete(lensCache.keys().next().value);
      onLensCacheChange?.(lensCache);
    }
    return send(res, result.status, result.body);
  }

  return createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    try {
      if (pathname === "/healthz") return send(res, 200, { status: "ok" });
      if (pathname === "/api/lens" && req.method === "POST") return await handleLens(req, res);
      if (pathname === "/api/jobs" && req.method === "GET")
        return send(res, 200, getJobs ? await getJobs() : { jobs: [], fetchedAt: null, source: "none" });
      // Account verification is parked in verification/; tell its UI it's switched off.
      if (pathname === "/api/config" && req.method === "GET") return send(res, 200, { enabled: false, identityEnabled: false });
      if (pathname.startsWith("/api/")) return send(res, 404, { error: "Not found" });
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", "text/plain");
      const file = STATIC[pathname];
      if (!file) return send(res, 404, "Not found", "text/plain");
      return send(res, 200, await readFile(join(root, file)), TYPES[extname(file)] || "application/octet-stream");
    } catch (error) {
      if (error.code === "ENOENT") return send(res, 404, "Not found", "text/plain");
      if (!error.status) console.error(error);
      return send(res, error.status || 500, { error: error.status ? error.message : "Server error" });
    }
  });
}

// Started directly (npm start): load keys, Adzuna cache and saved lens results, then listen.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.loadEnvFile(join(root, ".env"));
  } catch {
    /* No .env: lens runs offline, job picker serves cache only. */
  }
  const port = Number(process.env.PORT || 8766);
  // Locally stay on loopback; when a host supplies PORT (e.g. Hostinger), listen on all interfaces.
  const host = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");
  const model = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const generate = await createGeminiGenerator({ apiKey: process.env.GEMINI_API_KEY, model });
  if (!generate) console.warn("[lens] GEMINI_API_KEY not set; the lens will use offline keyword matching.");

  const jobsReady = loadJobs({
    appId: process.env.ADZUNA_APP_ID,
    appKey: process.env.ADZUNA_APP_KEY,
    cachePath: join(root, "data", "adzuna-cache.json"),
  });

  const lensCachePath = join(root, "data", "lens-cache.json");
  let lensCache = new Map();
  try {
    lensCache = new Map(Object.entries(JSON.parse(readFileSync(lensCachePath, "utf8"))));
    console.log(`[lens] loaded ${lensCache.size} saved result(s).`);
  } catch {
    /* No saved results yet. */
  }
  let saveTimer;
  const onLensCacheChange = (cache) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      mkdir(dirname(lensCachePath), { recursive: true })
        .then(() => writeFile(lensCachePath, JSON.stringify(Object.fromEntries(cache))))
        .catch((error) => console.warn(`[lens] could not save results: ${error.message}`));
    }, 500);
  };

  createLensServer({ lens: { generate, model }, getJobs: () => jobsReady, lensCache, onLensCacheChange }).listen(port, host, () => {
    console.log(`Vouch YYC on http://localhost:${port}  (model: ${generate ? model : "offline"})`);
  });
}
