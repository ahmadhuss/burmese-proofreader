#!/usr/bin/env node
// Stage 0 (intake) CLI entrypoint — multi-GB Meta export sets aren't practical to upload
// over HTTP, so this registers an IngestionBatch directly from a path already on the
// server's disk and kicks off Stage 1 parsing. See docs/rag-chatbot-plan.md §2.
require("dotenv").config();
const prisma = require("../db/prisma");
const { addParseJob } = require("../queues/ingest.queue");
const logger = require("../utils/logger");

async function main() {
  const [, , clientId, filePath] = process.argv;
  if (!clientId || !filePath) {
    console.error("Usage: node src/cli/backfill.js <clientId> <path-to-meta-export-dir>");
    process.exit(1);
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    console.error(`No Client found with id ${clientId}`);
    process.exit(1);
  }

  const batch = await prisma.ingestionBatch.create({
    data: { clientId, filePath, status: "UPLOADED" }
  });

  await addParseJob(batch.id);
  logger.info("Queued ingestion batch", { batchId: batch.id, clientId, filePath });

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
