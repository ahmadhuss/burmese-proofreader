const prisma = require("./prisma");

// Prisma has no native `vector` type, so every read/write of the KnowledgeChunk.embedding
// column goes through this module as raw SQL instead of Prisma Client (docs/rag-chatbot-plan.md §1).

function toVectorLiteral(embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("embedding must be a non-empty array of numbers");
  }
  return `[${embedding.join(",")}]`;
}

async function setEmbedding(chunkId, clientId, embedding) {
  await prisma.$executeRawUnsafe(
    `UPDATE "KnowledgeChunk" SET "embedding" = $1::vector, "status" = 'READY', "updatedAt" = now() WHERE "id" = $2 AND "clientId" = $3`,
    toVectorLiteral(embedding),
    chunkId,
    clientId
  );
}

// Top-k nearest KnowledgeChunk rows for one client, scoped to that client's partition.
async function similaritySearch(clientId, queryEmbedding, limit = 5) {
  return prisma.$queryRawUnsafe(
    `SELECT "id", "question", "answer", "category", 1 - ("embedding" <=> $1::vector) AS similarity
     FROM "KnowledgeChunk"
     WHERE "clientId" = $2 AND "status" = 'READY'
     ORDER BY "embedding" <=> $1::vector
     LIMIT $3`,
    toVectorLiteral(queryEmbedding),
    clientId,
    limit
  );
}

// Used during ingestion (stage 4) to avoid inserting near-duplicate knowledge chunks.
async function findNearDuplicate(clientId, category, embedding, threshold = 0.97) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT "id" FROM "KnowledgeChunk"
     WHERE "clientId" = $2 AND "status" = 'READY'
       AND (("category" IS NULL AND $3::text IS NULL) OR "category" = $3)
       AND 1 - ("embedding" <=> $1::vector) > $4
     ORDER BY "embedding" <=> $1::vector
     LIMIT 1`,
    toVectorLiteral(embedding),
    clientId,
    category ?? null,
    threshold
  );
  return rows[0]?.id ?? null;
}

module.exports = { toVectorLiteral, setEmbedding, similaritySearch, findNearDuplicate };
