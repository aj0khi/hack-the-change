// Live Calgary postings from Adzuna (Canada endpoint), cached to disk so the demo never
// depends on a live call. Free tier is rate limited, so we fetch a handful of searches at
// startup at most every CACHE_HOURS and serve from the cache file afterwards.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export const DEFAULT_QUERIES = [
  "customer service",
  "IT support",
  "program coordinator",
  "administrative assistant",
  "junior analyst",
];
const CACHE_HOURS = 12;

export function normalizeJob(job, query) {
  const description = String(job.description ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    id: String(job.id),
    title: String(job.title ?? "").replace(/<[^>]+>/g, "").trim(),
    company: job.company?.display_name ?? "",
    location: job.location?.display_name ?? "",
    description,
    // Adzuna search results usually carry a truncated description; flag it so the UI can say so.
    snippet: /(…|\.\.\.)$/.test(description) || description.length < 600,
    url: job.redirect_url ?? "",
    created: job.created ?? "",
    query,
  };
}

export async function fetchCalgaryJobs({ appId, appKey, queries = DEFAULT_QUERIES, perQuery = 6, fetchImpl = fetch }) {
  const seen = new Set();
  const jobs = [];
  for (const what of queries) {
    const url = new URL("https://api.adzuna.com/v1/api/jobs/ca/search/1");
    url.search = new URLSearchParams({
      app_id: appId,
      app_key: appKey,
      what,
      where: "Calgary",
      results_per_page: String(perQuery),
      "content-type": "application/json",
    });
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Adzuna ${response.status} for "${what}"`);
    const data = await response.json();
    for (const job of data.results ?? []) {
      if (seen.has(String(job.id))) continue;
      seen.add(String(job.id));
      jobs.push(normalizeJob(job, what));
    }
  }
  return jobs;
}

async function readCache(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

// Returns { jobs, fetchedAt, source } — never throws; falls back to whatever cache exists.
export async function loadJobs({ appId, appKey, cachePath, log = console }) {
  const cached = await readCache(cachePath);
  const fresh =
    cached?.fetchedAt && Date.now() - Date.parse(cached.fetchedAt) < CACHE_HOURS * 3600e3;
  if (fresh || !appId || !appKey) {
    if (!appId || !appKey) log.warn?.("[adzuna] ADZUNA_APP_ID / ADZUNA_APP_KEY not set; serving cache only.");
    return { jobs: cached?.jobs ?? [], fetchedAt: cached?.fetchedAt ?? null, source: cached ? "cache" : "none" };
  }
  try {
    const jobs = await fetchCalgaryJobs({ appId, appKey });
    const snapshot = { fetchedAt: new Date().toISOString(), jobs };
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(snapshot, null, 2));
    const snippets = jobs.filter((j) => j.snippet).length;
    log.log?.(`[adzuna] cached ${jobs.length} Calgary postings (${snippets} with truncated descriptions).`);
    return { ...snapshot, source: "live" };
  } catch (error) {
    log.warn?.(`[adzuna] fetch failed (${error.message}); serving cache.`);
    return { jobs: cached?.jobs ?? [], fetchedAt: cached?.fetchedAt ?? null, source: cached ? "cache" : "none" };
  }
}
