// Thin wrapper around the official @google/genai SDK. Returns a `generate` function for lens.mjs.
export async function createGeminiGenerator({ apiKey, model }) {
  if (!apiKey) return null;
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });
  return async function generate({ prompt, schema }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          temperature: 0,
          abortSignal: controller.signal,
        },
      });
      return JSON.parse(response.text);
    } finally {
      clearTimeout(timer);
    }
  };
}
