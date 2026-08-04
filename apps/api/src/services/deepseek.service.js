require("dotenv").config();
const { createDeepSeekClient, callTool, objectSchema, toolDefinition } = require("deepseek-client");
const { buildEditingPrompt, buildStrictEditingPrompt } = require("prompts");
const logger = require("../utils/logger");

const client = createDeepSeekClient({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseUrl: process.env.DEEPSEEK_BASE_URL
});

const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const DEFAULT_MAX_OUTPUT_TOKENS = parseInt(process.env.DEEPSEEK_MAX_OUTPUT_TOKENS || "64000", 10);
const SYSTEM_PROMPT = "You are a professional Burmese book editor. Use the required tool call to return the requested structured result.";

const SUSPICIOUS_PHRASES = ["the rest continues", "chapters continue", "same level of correction applied", "full edited text has been prepared", "same correction applied"];

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

  const { result, reasoningContent } = await callTool(client, {
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    tool,
    model: model || DEFAULT_MODEL,
    maxTokens: maxTokens || DEFAULT_MAX_OUTPUT_TOKENS,
    thinkingEnabled,
    reasoningEffort
  });

  if (reasoningContent) {
    logger.debug(`Thinking tokens: ~${Math.round(reasoningContent.length / 4)}`);
  }

  return result;
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
