require("dotenv").config();
const { Worker } = require("bullmq");
const logger = require("../utils/logger");
const prisma = require("../db/prisma");
const { connection, addSegmentJob, addCurateJob, addEmbedJob } = require("./ingest.queue");
const { pullConversationsFromGraph } = require("../services/ingestion/graph-pull.service");
const { parseBatch } = require("../services/ingestion/parse.service");
const { segmentBatch } = require("../services/ingestion/segment.service");
const { curateEpisode } = require("../services/ingestion/curate.service");
const { embedChunk } = require("../services/ingestion/embed.service");

// Runs all four ingestion stages (docs/rag-chatbot-plan.md §2) in one process, kept
// separate from message.worker.js so bulk backfill work never delays live chat replies.

// Alternative Stage 1 for a Facebook Page's own conversation history, which has no
// manual export file the way a personal account does — pulls it live via the Graph API
// instead (src/services/ingestion/graph-pull.service.js), then joins the same pipeline.
const pullWorker = new Worker(
  "chatbot-ingest-pull",
  async job => {
    const { batchId, sinceDate, untilDate, targetPsid } = job.data;
    await pullConversationsFromGraph(batchId, { sinceDate, untilDate, targetPsid });
    await prisma.ingestionBatch.update({ where: { id: batchId }, data: { status: "SEGMENTING" } });
    await addSegmentJob(batchId);
  },
  { connection, concurrency: 1 }
);

const parseWorker = new Worker(
  "chatbot-ingest-parse",
  async job => {
    const { batchId } = job.data;
    await prisma.ingestionBatch.update({ where: { id: batchId }, data: { status: "PARSING" } });
    await parseBatch(batchId);
    await prisma.ingestionBatch.update({ where: { id: batchId }, data: { status: "SEGMENTING" } });
    await addSegmentJob(batchId);
  },
  { connection, concurrency: 1 }
);

const segmentWorker = new Worker(
  "chatbot-ingest-segment",
  async job => {
    const { batchId } = job.data;
    await segmentBatch(batchId);

    const episodes = await prisma.conversationEpisode.findMany({ where: { batchId }, select: { id: true } });

    // Nothing to curate (e.g. a date-range/psid filter matched no messages) — there's no
    // episode left to trigger maybeCompleteBatch below, so finish the batch here instead
    // of leaving it stuck at CURATING forever.
    if (episodes.length === 0) {
      await prisma.ingestionBatch.update({ where: { id: batchId }, data: { status: "COMPLETED" } });
      return;
    }

    await prisma.ingestionBatch.update({ where: { id: batchId }, data: { status: "CURATING" } });
    for (const episode of episodes) {
      await addCurateJob(episode.id);
    }
  },
  { connection, concurrency: 1 }
);

const curateWorker = new Worker(
  "chatbot-ingest-curate",
  async job => {
    const { episodeId } = job.data;
    const { batchId } = await curateEpisode(episodeId);

    const pending = await prisma.knowledgeChunk.findMany({
      where: { sourceEpisodeId: episodeId, status: "PENDING_EMBED" },
      select: { id: true }
    });
    for (const chunk of pending) {
      await addEmbedJob(chunk.id);
    }

    await markEpisodeCurated(batchId);
  },
  { connection, concurrency: parseInt(process.env.INGEST_CURATE_CONCURRENCY || "3", 10) }
);

const embedWorker = new Worker(
  "chatbot-ingest-embed",
  async job => {
    const { chunkId } = job.data;
    await embedChunk(chunkId);
    await maybeCompleteBatch(chunkId);
  },
  { connection, concurrency: parseInt(process.env.INGEST_EMBED_CONCURRENCY || "5", 10) }
);

// Atomically counts episodes finished curating, regardless of whether they produced any
// chunks — fixes a stuck-at-CURATING edge case where the last episode(s) in a batch yield
// zero reusable Q&A and so never enqueue an embed job, meaning maybeCompleteBatch below
// would otherwise never run for them. `increment` is a single atomic UPDATE, so concurrent
// curate workers (INGEST_CURATE_CONCURRENCY) can't race each other on this count.
async function markEpisodeCurated(batchId) {
  const batch = await prisma.ingestionBatch.update({
    where: { id: batchId },
    data: { curatedEpisodes: { increment: 1 } }
  });
  if (batch.status !== "CURATING") return;

  const totalEpisodes = await prisma.conversationEpisode.count({ where: { batchId } });
  if (batch.curatedEpisodes < totalEpisodes) return; // other episodes still curating

  const remaining = await prisma.knowledgeChunk.count({
    where: { sourceEpisode: { batchId }, status: "PENDING_EMBED" }
  });
  if (remaining === 0) {
    await prisma.ingestionBatch.update({ where: { id: batchId }, data: { status: "COMPLETED" } });
    logger.info("Ingestion batch completed (all episodes curated, nothing left to embed)", { batchId });
  }
}

// Once every chunk for a batch has left PENDING_EMBED, mark the batch COMPLETED. Cheap to
// check per-job at pilot volume; revisit with a periodic reconciliation pass at scale.
async function maybeCompleteBatch(chunkId) {
  const chunk = await prisma.knowledgeChunk.findUnique({
    where: { id: chunkId },
    select: { sourceEpisode: { select: { batchId: true } } }
  });
  const batchId = chunk?.sourceEpisode?.batchId;
  if (!batchId) return;

  const batch = await prisma.ingestionBatch.findUnique({ where: { id: batchId }, select: { status: true } });
  if (batch?.status !== "CURATING") return;

  const remaining = await prisma.knowledgeChunk.count({
    where: { sourceEpisode: { batchId }, status: "PENDING_EMBED" }
  });
  if (remaining === 0) {
    await prisma.ingestionBatch.update({ where: { id: batchId }, data: { status: "COMPLETED" } });
    logger.info("Ingestion batch completed", { batchId });
  }
}

for (const worker of [pullWorker, parseWorker, segmentWorker, curateWorker, embedWorker]) {
  worker.on("failed", (job, err) => logger.error(`${job?.queueName || "ingest"} job failed`, { bullJobId: job?.id, error: err.message }));
}

logger.info("Chatbot ingest workers started");
