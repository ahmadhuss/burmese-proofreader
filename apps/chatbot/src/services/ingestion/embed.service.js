const prisma = require("../../db/prisma");
const { embedText } = require("../embedding.service");
const vectorDb = require("../../db/vector");

// Stage 4 — embeds one knowledge chunk and, before writing it, checks for a near-duplicate
// already READY for the same client+category (cosine similarity > 0.97) so the index
// doesn't accumulate redundant vectors at scale.
async function embedChunk(chunkId) {
  const chunk = await prisma.knowledgeChunk.findUnique({ where: { id: chunkId } });
  if (!chunk) throw new Error(`KnowledgeChunk not found: ${chunkId}`);
  if (chunk.status !== "PENDING_EMBED") return chunk.status;

  const embedding = await embedText(`${chunk.question}\n${chunk.answer}`);

  const duplicateOfId = await vectorDb.findNearDuplicate(chunk.clientId, chunk.category, embedding);
  if (duplicateOfId) {
    await prisma.knowledgeChunk.update({
      where: { id: chunk.id },
      data: { status: "DUPLICATE", duplicateOfId }
    });
    return "DUPLICATE";
  }

  await vectorDb.setEmbedding(chunk.id, chunk.clientId, embedding);
  return "READY";
}

module.exports = { embedChunk };
