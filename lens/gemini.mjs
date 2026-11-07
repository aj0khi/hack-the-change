// Thin wrapper around the official @google/genai SDK. Returns a `generate` function for lens.mjs.
// Low thinking keeps latency down (extraction + matching doesn't need deep reasoning), and one
// quick retry rides out Gemini's transient 503 "high demand" errors.
export const GEMINI_TIMEOUT_MS = 25000;

// Only "overloaded" errors are worth a retry; quota (429) errors won't clear in 1.5 s and would waste a request.
const isTransient = (error) => /\b(503|UNAVAILABLE|high demand)\b/i.test(String(error?.message ?? error));

export async function createGeminiGenerator({ apiKey, model }) {
  if (!apiKey) return null;
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  async function once(prompt, schema, signal) {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
        temperature: 0,
        thinkingConfig: { thinkingLevel: "LOW" },
        abortSignal: signal,
      },
    });
    return JSON.parse(response.text);
  }

  return async function generate({ prompt, schema }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      try {
        return await once(prompt, schema, controller.signal);
      } catch (error) {
        if (!isTransient(error) || controller.signal.aborted) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return await once(prompt, schema, controller.signal);
      }
    } finally {
      clearTimeout(timer);
    }
  };
}
