-- Tracks how many episodes have finished curation for a batch, regardless of whether they
-- produced any KnowledgeChunk rows — fixes a stuck-at-CURATING edge case where the last
-- episode(s) in a batch yield zero reusable Q&A and so never trigger the embed-driven
-- completion check. See ingest.worker.js.
ALTER TABLE "IngestionBatch" ADD COLUMN "curatedEpisodes" INTEGER NOT NULL DEFAULT 0;
