require("dotenv").config();
const OpenAI = require("openai");
const { buildEditingPrompt, buildStrictEditingPrompt } = require("prompts");
const logger = require("../utils/logger");

function resolveBaseUrl() {
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  return baseUrl.endsWith("/beta") ? baseUrl : `${baseUrl}/beta`;
}

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: resolveBaseUrl()
});

const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const DEFAULT_MAX_OUTPUT_TOKENS = parseInt(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS || "64000", 10);

const SUSPICIOUS_PHRASES = ["the rest continues", "chapters continue", "same level of correction applied", "full edited text has been prepared", "same correction applied"];

// Small helper for strict DeepSeek tool schemas. Every field is required by design.
function objectSchema(properties) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false
  };
}

// DeepSeek strict mode expects a function-style tool with a JSON schema.
function toolDefinition(name, description, parameters) {
  return {
    type: "function",
    function: {
      name,
      strict: true,
      description,
      parameters
    }
  };
}

// The model must call this tool instead of replying with loose text.
const CORRECT_TEXT_TOOL = toolDefinition(
  "submit_corrected_text",
  "Submit the complete corrected Burmese text.",
  objectSchema({
    corrected_text: {
      type: "string",
      description: "The full corrected text, preserving meaning, paragraph order, and chapter headings."
    }
  })
);

// Sends one prompt to DeepSeek and returns the structured tool result.
async function callDeepSeekTool(prompt, tool, model, opts = {}) {
  const { thinkingEnabled = false, reasoningEffort = "high", maxTokens } = opts;
  const toolName = tool.function.name;

  const params = {
    model: model || DEFAULT_MODEL,
    messages: [
      { role: "system", content: "You are a professional Burmese book editor. Use the required tool call to return the requested structured result." },
      { role: "user", content: prompt }
    ],
    tools: [tool],
    tool_choice: { type: "function", function: { name: toolName } },
    max_tokens: maxTokens || DEFAULT_MAX_OUTPUT_TOKENS,
    stream: false
  };

  if (thinkingEnabled) {
    params.thinking = { type: "enabled" };
    params.reasoning_effort = reasoningEffort;
    params.temperature = 1;
  } else {
    params.thinking = { type: "disabled" };
    params.temperature = 0.2;
  }

  const response = await client.chat.completions.create(params);
  const choice = response.choices[0];
  const msg = choice.message;

  if (msg.reasoning_content) {
    logger.debug(`Thinking tokens: ~${Math.round(msg.reasoning_content.length / 4)}`);
  }

  const call = msg.tool_calls?.find(toolCall => toolCall.function?.name === toolName);
  if (!call) {
    throw new Error(`DeepSeek did not return required tool call "${toolName}" (finish_reason: ${choice.finish_reason})`);
  }

  try {
    return JSON.parse(call.function.arguments);
  } catch (err) {
    throw new Error(`DeepSeek returned invalid tool arguments for "${toolName}" (finish_reason: ${choice.finish_reason}, argument_length: ${call.function.arguments?.length || 0}): ${err.message}`);
  }
}

// The schema makes the response parseable; these checks make sure the book was not shortened.
function validateOutput(original, corrected) {
  if (!corrected || corrected.trim().length === 0) {
    return { valid: false, reason: "Output is empty" };
  }
  if (corrected.length < original.length * 0.4) {
    return { valid: false, reason: "Output is too short compared to input" };
  }
  const lower = corrected.toLowerCase();
  for (const phrase of SUSPICIOUS_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      return { valid: false, reason: `Suspicious phrase found: "${phrase}"` };
    }
  }
  return { valid: true };
}

// Corrects one book piece. Retries use the stricter prompt from the shared prompts package.
async function correctChunk(chunk, retryCount = 0, model, opts = {}) {
  const prompt = retryCount === 0 ? buildEditingPrompt(chunk.originalText) : buildStrictEditingPrompt(chunk.originalText);
  const maxTokens = Math.min(DEFAULT_MAX_OUTPUT_TOKENS, Math.max(8192, Math.ceil(chunk.originalText.length * 1.5) + 4000));

  const result = await callDeepSeekTool(prompt, CORRECT_TEXT_TOOL, model, { ...opts, maxTokens });
  const corrected = result.corrected_text.trim();

  const { valid, reason } = validateOutput(chunk.originalText, corrected);
  if (!valid) throw new Error(`Validation failed: ${reason}`);

  return corrected;
}

module.exports = { correctChunk, callDeepSeekTool, objectSchema, toolDefinition };
