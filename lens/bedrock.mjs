// Amazon Bedrock (Nova Lite by default) behind the same `generate({ prompt, schema })` contract lens.mjs uses.
// Structured output: the Converse API is given one tool whose input schema is the lens schema, and the model
// is told to call it, so the tool input *is* the JSON answer. Grounding still happens in lens.mjs, in code.
export const BEDROCK_TIMEOUT_MS = 25000;
export const DEFAULT_BEDROCK_MODEL = "us.amazon.nova-lite-v1:0";
export const DEFAULT_BEDROCK_REGION = "us-east-1";
const TOOL_NAME = "report_lens";

// Credentials come from the standard AWS chain: a Bedrock API key (AWS_BEARER_TOKEN_BEDROCK),
// access keys (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY), or a named profile (AWS_PROFILE).
export function hasBedrockCredentials(env = process.env) {
  return Boolean(env.AWS_BEARER_TOKEN_BEDROCK || (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) || env.AWS_PROFILE);
}

function extractJson(blocks) {
  const toolUse = blocks.find((block) => block?.toolUse?.name === TOOL_NAME)?.toolUse ?? blocks.find((block) => block?.toolUse)?.toolUse;
  if (toolUse?.input && typeof toolUse.input === "object") return toolUse.input;
  const text = blocks.map((block) => block?.text ?? "").join("");
  const json = text.match(/\{[\s\S]*\}/);
  if (json) return JSON.parse(json[0]);
  throw new Error("Model returned no structured result");
}

/**
 * Returns a generate function, or null when no AWS credentials are configured (the lens then falls back offline).
 * `client` can be injected for tests: any object with `send(command, options)`.
 */
export async function createBedrockGenerator({ modelId = DEFAULT_BEDROCK_MODEL, region = DEFAULT_BEDROCK_REGION, env = process.env, client } = {}) {
  if (!client && !hasBedrockCredentials(env)) return null;
  const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
  // The SDK retries throttling and 5xx itself; keep it to one retry so the lens stays under its timeout.
  const runtime = client ?? new BedrockRuntimeClient({ region, maxAttempts: 2 });

  function command(prompt, schema, toolChoice) {
    return new ConverseCommand({
      modelId,
      system: [{ text: `Answer only by calling the ${TOOL_NAME} tool with JSON that matches its input schema.` }],
      messages: [{ role: "user", content: [{ text: prompt }] }],
      toolConfig: {
        tools: [{ toolSpec: { name: TOOL_NAME, description: "Report the extracted job requirements, evidence matches and project suggestions.", inputSchema: { json: schema } } }],
        toolChoice,
      },
      inferenceConfig: { temperature: 0, maxTokens: 4000 },
    });
  }

  return async function generate({ prompt, schema }) {
    const abortSignal = AbortSignal.timeout(BEDROCK_TIMEOUT_MS);
    let response;
    try {
      response = await runtime.send(command(prompt, schema, { tool: { name: TOOL_NAME } }), { abortSignal });
    } catch (error) {
      // Some models reject forcing a named tool; "any" still forces a tool call.
      if (!/toolChoice|tool choice/i.test(String(error?.message))) throw error;
      response = await runtime.send(command(prompt, schema, { any: {} }), { abortSignal });
    }
    return extractJson(response?.output?.message?.content ?? []);
  };
}
