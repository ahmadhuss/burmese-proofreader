-- Hand-written (not `prisma migrate dev` generated) because this schema needs two things
-- Prisma's migration engine cannot express: the pgvector extension/column type, and
-- LIST-partitioning "KnowledgeChunk" BY "clientId" for tenant isolation + per-client HNSW
-- indexes (see docs/rag-chatbot-plan.md §1). Verify this against a real Postgres+pgvector
-- instance before first deploy — it has not been run against a live database yet.
--
-- IMPORTANT: because "KnowledgeChunk" is partitioned, its physical primary key is
-- ("id", "clientId"), not "id" alone (Postgres requires the partition key in the PK).
-- schema.prisma still declares `id String @id` for a simple Prisma Client API — that is
-- intentional and fine for row lookups (a plain WHERE id = $1 is still correct, just not
-- partition-pruned). Do NOT run a plain `prisma migrate dev` that tries to "fix" this
-- apparent drift back to a single-column PK — it will break partitioning. Future schema
-- changes to KnowledgeChunk must be hand-reconciled the same way this migration was.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facebookPageId" TEXT NOT NULL,
    "pageAccessToken" TEXT NOT NULL,
    "appSecret" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL DEFAULT 'intfloat/multilingual-e5-small',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Client_facebookPageId_key" ON "Client"("facebookPageId");

-- CreateTable ("KnowledgeChunk" — partitioned, see note above)
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT,
    "language" TEXT,
    "sourceEpisodeId" TEXT,
    "extractionVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING_EMBED',
    "duplicateOfId" TEXT,
    "embedding" vector(384),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id", "clientId")
) PARTITION BY LIST ("clientId");

-- Catch-all partition: real client partitions are created by
-- src/db/partitions.js:createClientPartition() when a Client row is provisioned. The
-- DEFAULT partition exists only so an insert never hard-fails if that step is skipped —
-- rows landing here won't have an HNSW index and should be treated as a bug, not routed
-- around.
CREATE TABLE "KnowledgeChunk_default" PARTITION OF "KnowledgeChunk" DEFAULT;

CREATE UNIQUE INDEX "KnowledgeChunk_episode_version_question_client_key"
    ON "KnowledgeChunk"("sourceEpisodeId", "extractionVersion", "question", "clientId");
CREATE INDEX "KnowledgeChunk_clientId_status_idx" ON "KnowledgeChunk"("clientId", "status");

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "psid" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationSession_clientId_psid_key" ON "ConversationSession"("clientId", "psid");

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "retrievedChunkIds" JSONB,
    "mid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationMessage_mid_key" ON "ConversationMessage"("mid");

-- CreateTable
CREATE TABLE "IngestionBatch" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawMessage" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "isFromClient" BOOLEAN NOT NULL,
    "content" TEXT NOT NULL,
    "timestampMs" BIGINT NOT NULL,
    "episodeId" TEXT,

    CONSTRAINT "RawMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RawMessage_batch_thread_ts_sender_key" ON "RawMessage"("batchId", "threadId", "timestampMs", "senderName");
CREATE INDEX "RawMessage_episodeId_idx" ON "RawMessage"("episodeId");

-- CreateTable
CREATE TABLE "ConversationEpisode" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationEpisode_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_sourceEpisodeId_fkey" FOREIGN KEY ("sourceEpisodeId") REFERENCES "ConversationEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IngestionBatch" ADD CONSTRAINT "IngestionBatch_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RawMessage" ADD CONSTRAINT "RawMessage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IngestionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RawMessage" ADD CONSTRAINT "RawMessage_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "ConversationEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConversationEpisode" ADD CONSTRAINT "ConversationEpisode_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IngestionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
