require("dotenv").config();
const { createDeepSeekClient, callTool, objectSchema, toolDefinition } = require("deepseek-client");
const logger = require("../utils/logger");

const client = createDeepSeekClient({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseUrl: process.env.DEEPSEEK_BASE_URL
});

const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

const REPLY_TOOL = toolDefinition(
  "submit_reply",
  "Submit the reply to send back to the Messenger user.",
  objectSchema({
    reply_text: {
      type: "string",
      description: "The reply to send to the user, in the same language they wrote in."
    },
    confidence: {
      type: "number",
      description: "0.0-1.0 confidence that reply_text correctly and fully answers the user, based only on the provided context."
    },
    escalate_to_human: {
      type: "boolean",
      description: "True if this should be handed off to a human agent instead of (or in addition to) sending reply_text."
    }
  })
);

const KNOWLEDGE_EXTRACTION_TOOL = toolDefinition(
  "submit_knowledge_chunks",
  "Submit clean Q&A knowledge chunks extracted from a conversation transcript.",
  objectSchema({
    chunks: {
      type: "array",
      description: "Zero or more canonical Q&A pairs worth keeping as reusable knowledge. Skip greetings, small talk, and anything without a real informational question+answer.",
      items: objectSchema({
        question: { type: "string", description: "Canonical, self-contained version of the customer's question." },
        answer: { type: "string", description: "Canonical, self-contained version of the answer given." },
        category: { type: "string", description: "Short topic label, e.g. 'shipping', 'pricing', 'returns'." },
        confidence: { type: "number", description: "0.0-1.0 confidence this is accurate, reusable knowledge." }
      })
    }
  })
);

// Generates one chat reply given retrieved context + recent conversation history.
async function generateReply({ systemPrompt, contextChunks, history, userMessage, model }) {
  const contextText = contextChunks.length
    ? contextChunks.map((c, i) => `[${i + 1}] Q: ${c.question}\nA: ${c.answer}`).join("\n\n")
    : "(no relevant knowledge found)";

  const historyText = history.length
    ? history.map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n")
    : "(no prior messages)";

  const prompt = [
    "Relevant knowledge (use only this to answer factual questions; do not invent facts not present here):",
    contextText,
    "",
    "Recent conversation history:",
    historyText,
    "",
    `New user message: ${userMessage}`
  ].join("\n");

  const { result, reasoningContent } = await callTool(client, {
    prompt,
    systemPrompt,
    tool: REPLY_TOOL,
    model: model || DEFAULT_MODEL,
    maxTokens: 2000
  });

  if (reasoningContent) {
    logger.debug(`Reply reasoning tokens: ~${Math.round(reasoningContent.length / 4)}`);
  }

  return result;
}

// Ingestion stage 3: turns one raw conversation episode into curated Q&A knowledge chunks.
async function extractKnowledgeChunks({ transcript, model }) {
  const prompt = [
    "Below is a raw customer-service conversation transcript. Extract any reusable, factual",
    "Q&A knowledge from it. Ignore greetings, small talk, thanks, and anything that isn't a",
    "real question with a real answer. Rewrite each question and answer to be clear and",
    "self-contained (don't reference 'the message above' etc). If nothing reusable is in this",
    "transcript, return an empty chunks array.",
    "",
    "Transcript:",
    transcript
  ].join("\n");

  const { result } = await callTool(client, {
    prompt,
    systemPrompt: "You are a knowledge-extraction assistant for a customer support archive. Use the required tool call to return the requested structured result.",
    tool: KNOWLEDGE_EXTRACTION_TOOL,
    model: model || DEFAULT_MODEL,
    maxTokens: 4000
  });

  return result.chunks || [];
}

module.exports = { generateReply, extractKnowledgeChunks };
