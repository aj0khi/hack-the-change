// Groq (OpenAI-compatible chat API) behind the same `generate({ prompt, schema })` contract lens.mjs uses.
// The lens schema goes in response_format as a JSON schema; grounding still happens in lens.mjs, in code.
export const GROQ_TIMEOUT_MS = 20000;
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

class GroqError extends Error {
  constructor(status, message) {
    super(`Groq ${status}: ${message}`);
    this.status = status;
  }
}

/**
 * Returns a generate function, or null when GROQ_API_KEY is not set (the lens then tries the next provider).
 * `fetchImpl` can be injected for tests.
 */
export function createGroqGenerator({ apiKey, model = DEFAULT_GROQ_MODEL, fetchImpl = fetch } = {}) {
  if (!apiKey) return null;

  async function call(body) {
    const response = await fetchImpl(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new GroqError(response.status, data?.error?.message || response.statusText || "request failed");
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("Groq returned no content");
    return JSON.parse(content);
  }

  return async function generate({ prompt, schema }) {
    const base = {
      model,
      temperature: 0,
      max_completion_tokens: 4000,
      messages: [
        { role: "system", content: "Answer only with JSON that matches the requested schema. No prose, no markdown." },
        { role: "user", content: prompt },
      ],
      // gpt-oss models reason before answering; low effort keeps latency and token use down.
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
    };
    try {
      return await call({ ...base, response_format: { type: "json_schema", json_schema: { name: "lens_result", schema } } });
    } catch (error) {
      // Models without JSON-schema support: fall back to plain JSON mode with the schema in the prompt.
      if (!(error instanceof GroqError && error.status === 400 && /response_format|json_schema|schema/i.test(error.message))) throw error;
      return await call({
        ...base,
        response_format: { type: "json_object" },
        messages: [base.messages[0], { role: "user", content: `${prompt}\n\nJSON SCHEMA\n${JSON.stringify(schema)}` }],
      });
    }
  };
}
