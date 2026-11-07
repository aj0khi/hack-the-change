// Employer Lens core: verify credentials, ask the model, then ground every match in code.
// The model is injected (`generate`) so tests can run offline with a mock.
import { verifyCredential } from "./trust.mjs";
import { projects as defaultCatalog } from "./projects.mjs";

export const MAX_SUGGESTIONS = 2;

export const MAX_POSTING_CHARS = 12000;
export const MAX_CREDENTIALS = 50;
export const MODEL_TIMEOUT_MS = 26000;

const KINDS = ["soft", "technical", "credential", "other"];
const EVIDENCE_TYPES = ["action", "praise"];

// Standard JSON Schema, sent as Gemini responseJsonSchema.
export const lensSchema = {
  type: "object",
  properties: {
    requirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          kind: { type: "string", enum: KINDS },
          matches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                credentialId: { type: "string" },
                quote: { type: "string" },
                evidenceType: { type: "string", enum: EVIDENCE_TYPES },
                why: { type: "string" },
              },
              required: ["credentialId", "quote", "evidenceType", "why"],
            },
          },
          suggestedProjects: {
            type: "array",
            items: {
              type: "object",
              properties: {
                projectId: { type: "string" },
                why: { type: "string" },
              },
              required: ["projectId", "why"],
            },
          },
        },
        required: ["text", "kind", "matches"],
      },
    },
  },
  required: ["requirements"],
};

export function buildPrompt(posting, validCredentials, catalog = defaultCatalog) {
  const projectList = catalog
    .map((p) => `[projectId: ${p.id}] ${p.title} | skills: ${p.skills.join(", ")} | ${p.description}`)
    .join("\n");
  const evidence = validCredentials
    .map(
      ({ id, payload }) =>
        `[credentialId: ${id}]\nTask: ${payload.title}\nIssuer: ${payload.issuer}\nWitness transcript: """${payload.transcript}"""\nSkills the witness confirmed: ${payload.mappings.map((m) => m.skill).join(", ")}`,
    )
    .join("\n\n");
  return `You help an employer check a job posting against a candidate's VERIFIED, signed evidence.

RULES
1. Extract at most 10 concrete requirements from the job posting. Use the posting's own wording, shortened if needed. Skip company boilerplate, benefits and salary.
2. Classify each requirement's kind: "soft" (people/communication skills), "technical" (a tool, technology or hard skill), "credential" (licence, degree, certification, clearance), or "other" (availability, location, etc.).
3. A match MUST cite a credentialId from the evidence list and a "quote" copied VERBATIM (exact characters, no paraphrase, no added or removed words) from THAT credential's witness transcript.
4. Prefer quotes describing what the student DID (evidenceType "action") over descriptions of them (evidenceType "praise"). A quote that mainly describes a quality ("patient", "kind", "clear", "helpful", "great") is "praise", even if it has a verb in it. "action" means the quote names a concrete thing the student did, made or fixed.
5. "technical" and "credential" requirements can never be satisfied by praise. Leave them unmatched unless a quote describes the student actually doing that exact thing.
6. If there is no real evidence, "matches" must be an empty array. An empty array is the correct, expected answer for most requirements. Never guess, stretch or infer.
7. "why" is one short sentence linking the quote to the requirement.
8. "suggestedProjects" helps the student close gaps. Fill it ONLY for requirements whose "matches" is empty AND whose kind is "soft" or "technical". Choose at most ${MAX_SUGGESTIONS} projectIds from the PROJECT CATALOG below, only if doing that project would genuinely build that specific skill. Its "why" is one short sentence naming what the student would practise. Otherwise use an empty array. Never invent a projectId.

PROJECT CATALOG
${projectList}

JOB POSTING
"""
${posting}
"""

VERIFIED EVIDENCE (${validCredentials.length} signed credential${validCredentials.length === 1 ? "" : "s"})
${evidence || "(none)"}`;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Model timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Code-side grounding: the AI never gets the last word.
export function groundRequirements(rawRequirements, validById, catalog = defaultCatalog) {
  const rejected = [];
  const projectsById = new Map(catalog.map((p) => [p.id, p]));
  let droppedSuggestions = 0;
  const requirements = (Array.isArray(rawRequirements) ? rawRequirements : [])
    .filter((r) => r && typeof r.text === "string" && r.text.trim())
    .slice(0, 12)
    .map((r) => {
      const kind = KINDS.includes(r.kind) ? r.kind : "other";
      const seen = new Set();
      const matches = [];
      for (const m of Array.isArray(r.matches) ? r.matches : []) {
        const credential = validById.get(String(m?.credentialId));
        const quote = typeof m?.quote === "string" ? m.quote.trim() : "";
        const evidenceType = EVIDENCE_TYPES.includes(m?.evidenceType)
          ? m.evidenceType
          : "praise";
        let reason;
        if (!credential) reason = "Cited a credential that is not valid or does not exist.";
        else if (!quote || !credential.payload.transcript.includes(quote))
          reason = "Quote is not word-for-word in that credential's transcript.";
        else if ((kind === "technical" || kind === "credential") && evidenceType === "praise")
          reason = "Praise cannot prove a technical skill or credential.";
        else if (seen.has(`${m.credentialId}|${quote}`)) continue;
        if (reason) {
          rejected.push({
            requirement: r.text.trim(),
            credentialId: String(m?.credentialId ?? ""),
            quote,
            reason,
          });
          continue;
        }
        seen.add(`${m.credentialId}|${quote}`);
        matches.push({
          credentialId: String(m.credentialId),
          quote,
          evidenceType,
          why: typeof m.why === "string" ? m.why.trim() : "",
          title: credential.payload.title,
          issuer: credential.payload.issuer,
          witness: credential.payload.witness,
        });
      }
      // Action evidence first.
      matches.sort((a, b) => (b.evidenceType === "action") - (a.evidenceType === "action"));

      // Suggestions: only real catalog projects, only for soft/technical gaps.
      const suggestedProjects = [];
      const rawSuggestions = Array.isArray(r.suggestedProjects) ? r.suggestedProjects : [];
      const canSuggest = matches.length === 0 && (kind === "soft" || kind === "technical");
      for (const s of rawSuggestions) {
        const project = projectsById.get(String(s?.projectId));
        if (
          !canSuggest ||
          !project ||
          suggestedProjects.length >= MAX_SUGGESTIONS ||
          suggestedProjects.some((p) => p.projectId === project.id)
        ) {
          droppedSuggestions++;
          continue;
        }
        suggestedProjects.push({
          projectId: project.id,
          why: typeof s.why === "string" ? s.why.trim() : "",
          title: project.title,
          organization: project.organization,
          time: project.time,
          skills: project.skills,
        });
      }
      return { text: r.text.trim(), kind, matches, suggestedProjects };
    });
  return { requirements, rejected, droppedSuggestions };
}

export async function runLens(
  { posting, credentials, issuerPublicKey },
  { generate, model = "unknown", timeoutMs = MODEL_TIMEOUT_MS } = {},
) {
  if (typeof posting !== "string" || !posting.trim())
    return { status: 400, body: { error: "Paste a job posting first." } };
  if (!Array.isArray(credentials) || typeof issuerPublicKey !== "string")
    return { status: 400, body: { error: "credentials[] and issuerPublicKey are required." } };

  const trimmed = posting.trim().slice(0, MAX_POSTING_CHARS);

  // 1. Only valid signed credentials go any further. Ids are positions in the submitted array.
  const checks = await Promise.all(
    credentials.slice(0, MAX_CREDENTIALS).map(async (token, index) => ({
      id: String(index),
      ...(typeof token === "string"
        ? await verifyCredential(token, issuerPublicKey)
        : { valid: false }),
    })),
  );
  const valid = checks.filter((c) => c.valid);
  const validById = new Map(valid.map((c) => [c.id, c]));

  // 2. One model call.
  let raw;
  try {
    if (!generate) throw new Error("No model configured");
    raw = await withTimeout(
      generate({ prompt: buildPrompt(trimmed, valid), schema: lensSchema }),
      timeoutMs,
    );
    if (typeof raw === "string") raw = JSON.parse(raw);
  } catch (error) {
    return {
      status: 200,
      body: { fallback: true, reason: error.message, validCredentials: valid.length },
    };
  }

  // 3. Grounding check in code.
  const { requirements, rejected, droppedSuggestions } = groundRequirements(raw?.requirements, validById);
  const matched = requirements.filter((r) => r.matches.length).length;
  return {
    status: 200,
    body: {
      requirements,
      rejected,
      stats: {
        total: requirements.length,
        matched,
        gaps: requirements.length - matched,
        droppedByGrounding: rejected.length,
        droppedSuggestions,
        validCredentials: valid.length,
        invalidCredentials: checks.length - valid.length,
      },
      model,
      generatedAt: new Date().toISOString(),
    },
  };
}
