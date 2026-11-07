// Vouch YYC server: static files + POST /api/lens (Gemini) + GET /api/jobs (Adzuna cache).
// Keys stay here, never in the browser.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runLens } from "./lens.mjs";
import { createGeminiGenerator } from "./gemini.mjs";
import { loadJobs } from "./adzuna.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
try {
  process.loadEnvFile(join(root, ".env"));
} catch {
  /* no .env: fine, keyword fallback + cache only */
}

const PORT = Number(process.env.PORT || 8765);
const HOST = process.env.HOST || "127.0.0.1";
const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const MAX_BODY = 512 * 1024;
const PUBLIC = new Set(["index.html", "app.js", "styles.css", "trust.mjs"]);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const generate = await createGeminiGenerator({ apiKey: process.env.GEMINI_API_KEY, model: MODEL });
if (!generate) console.warn("[lens] GEMINI_API_KEY not set; the lens will use offline keyword matching.");

let jobsSnapshot = { jobs: [], fetchedAt: null, source: "none" };
const jobsReady = loadJobs({
  appId: process.env.ADZUNA_APP_ID,
  appKey: process.env.ADZUNA_APP_KEY,
  cachePath: join(root, "data", "adzuna-cache.json"),
}).then((snapshot) => (jobsSnapshot = snapshot));

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

async function serveStatic(req, res, pathname) {
  const file = pathname === "/" ? "index.html" : normalize(decodeURIComponent(pathname.slice(1)));
  if (!PUBLIC.has(file) || file.includes(sep + "..")) return send(res, 404, "Not found", "text/plain");
  const full = join(root, file);
  await stat(full);
  send(res, 200, await readFile(full), TYPES[extname(file)] || "application/octet-stream");
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    if (pathname === "/api/lens" && req.method === "POST") {
      const result = await runLens(await readJson(req), { generate, model: MODEL });
      return send(res, result.status, result.body);
    }
    if (pathname === "/api/jobs" && req.method === "GET") {
      await jobsReady;
      return send(res, 200, jobsSnapshot);
    }
    if (pathname.startsWith("/api/")) return send(res, 404, { error: "Not found" });
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", "text/plain");
    return await serveStatic(req, res, pathname);
  } catch (error) {
    if (error.code === "ENOENT") return send(res, 404, "Not found", "text/plain");
    console.error(error);
    return send(res, error.status || 500, { error: error.status ? error.message : "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Vouch YYC on http://localhost:${PORT}  (model: ${generate ? MODEL : "offline"})`);
});
