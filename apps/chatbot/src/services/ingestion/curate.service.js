const prisma = require("../../db/prisma");
const logger = require("../../utils/logger");
const { extractKnowledgeChunks } = require("../deepseek.service");

// Bump this (via KNOWLEDGE_EXTRACTION_VERSION) to force re-curation of already-processed
// episodes after a prompt change, without duplicating existing chunks.
const EXTRACTION_VERSION = parseInt(process.env.KNOWLEDGE_EXTRACTION_VERSION || "1", 10);

// Stage 3 — sends one conversation episode to DeepSeek and writes back curated,
// PENDING_EMBED KnowledgeChunk rows (docs/rag-chatbot-plan.md §2).
async function curateEpisode(episodeId) {
  const episode = await prisma.conversationEpisode.findUnique({
    where: { id: episodeId },
    include: { messages: { orderBy: { timestampMs: "asc" } }, batch: true }
  });
  if (!episode) throw new Error(`ConversationEpisode not found: ${episodeId}`);

  if (!episode.messages.length) return { created: 0, batchId: episode.batchId };

  const transcript = episode.messages.map(m => `${m.isFromClient ? "Agent" : "Customer"}: ${m.content}`).join("\n");

  const chunks = await extractKnowledgeChunks({ transcript });

  let created = 0;
  for (const chunk of chunks) {
    if (!chunk.question || !chunk.answer) continue;

    await prisma.knowledgeChunk.upsert({
      where: {
        sourceEpisodeId_extractionVersion_question_clientId: {
          sourceEpisodeId: episodeId,
          extractionVersion: EXTRACTION_VERSION,
          question: chunk.question,
          clientId: episode.batch.clientId
        }
      },
      create: {
        clientId: episode.batch.clientId,
        question: chunk.question,
        answer: chunk.answer,
        category: chunk.category || null,
        sourceEpisodeId: episodeId,
        extractionVersion: EXTRACTION_VERSION,
        status: "PENDING_EMBED"
      },
      update: {}
    });
    created++;
  }

  logger.info(`Curated ${created} knowledge chunks`, { episodeId });
  return { created, batchId: episode.batchId };
}

module.exports = { curateEpisode, EXTRACTION_VERSION };
