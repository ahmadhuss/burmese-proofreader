const prisma = require("./prisma");
const logger = require("../utils/logger");

// cuid()-generated ids only; guards against building an unsafe SQL identifier below.
const SAFE_ID = /^[a-zA-Z0-9_]+$/;

function partitionTableName(clientId) {
  if (!SAFE_ID.test(clientId)) {
    throw new Error(`Unsafe clientId for partition table name: ${clientId}`);
  }
  return `KnowledgeChunk_${clientId}`;
}

// Provisions this client's KnowledgeChunk partition + its own HNSW index, so retrieval
// for one client is physically isolated from every other client's data and each ANN
// index stays small. Call this once, right after creating a Client row.
async function createClientPartition(clientId) {
  const table = partitionTableName(clientId);

  // Postgres DDL doesn't accept bind parameters for a partition bound — `FOR VALUES IN`
  // must be a literal, not `$1`. Inlining is safe here only because clientId was already
  // validated by SAFE_ID above (alphanumeric/underscore only, so it can't contain a quote).
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${table}" PARTITION OF "KnowledgeChunk" FOR VALUES IN ('${clientId}')`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "${table}_embedding_hnsw_idx" ON "${table}" USING hnsw ("embedding" vector_cosine_ops)`);

  logger.info("Created client partition", { clientId, table });
}

module.exports = { createClientPartition, partitionTableName };
