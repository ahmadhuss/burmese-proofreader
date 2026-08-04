const logger = require("../utils/logger");
const { getOrCreateSession, getRecentHistory, recordTurn, markEscalated } = require("./conversation.service");
const { retrieveContext } = require("./retrieval.service");
const { generateReply } = require("./deepseek.service");

const FALLBACK_REPLY = process.env.FALLBACK_REPLY_TEXT || "Thanks for your message — a member of our team will follow up with you shortly.";
const CONFIDENCE_THRESHOLD = parseFloat(process.env.REPLY_CONFIDENCE_THRESHOLD || "0.5");

// Core RAG reply pipeline (docs/rag-chatbot-plan.md §4), shared by the live Messenger
// worker (queues/message.worker.js) and the local test-chat route
// (routes/test-chat.routes.js). The only difference between the two callers is what
// happens to replyText afterward — sent via the Messenger Send API vs. returned directly
// in an HTTP response.
async function generateReplyForClient({ client, psid, text, mid }) {
  const startedAt = Date.now();

  const session = await getOrCreateSession(client.id, psid);
  const history = await getRecentHistory(session.id);

  const t1 = Date.now();
  const contextChunks = await retrieveContext(client.id, text);
  const t2 = Date.now();

  let replyText = FALLBACK_REPLY;
  let escalate = true;
  let confidence = 0;

  try {
    const reply = await generateReply({
      systemPrompt: client.systemPrompt,
      contextChunks,
      history,
      userMessage: text,
      model: process.env.DEEPSEEK_MODEL
    });

    replyText = reply.reply_text || FALLBACK_REPLY;
    confidence = reply.confidence ?? 0;
    escalate = Boolean(reply.escalate_to_human) || confidence < CONFIDENCE_THRESHOLD;
  } catch (err) {
    logger.error("DeepSeek reply generation failed, using fallback", { clientId: client.id, error: err.message });
  }
  const t3 = Date.now();

  await recordTurn({
    sessionId: session.id,
    userText: text,
    userMid: mid || null,
    replyText,
    retrievedChunkIds: contextChunks.map(c => c.id)
  });

  if (escalate) {
    await markEscalated(session.id);
  }

  const timings = { retrievalMs: t2 - t1, deepseekMs: t3 - t2, totalMs: Date.now() - startedAt };
  logger.info("Generated reply", { clientId: client.id, psid, mid, escalate, ...timings });

  return { replyText, escalate, confidence, contextChunks, session, timings };
}

module.exports = { generateReplyForClient };
