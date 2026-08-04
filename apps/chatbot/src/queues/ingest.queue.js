require("dotenv").config();
const { Queue } = require("bullmq");

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379")
};

// One queue per ingestion stage (docs/rag-chatbot-plan.md §2) so bulk backfill work never
// competes with the live chatbot's message queue for worker concurrency.
const pullQueue = new Queue("chatbot-ingest-pull", { connection });
const parseQueue = new Queue("chatbot-ingest-parse", { connection });
const segmentQueue = new Queue("chatbot-ingest-segment", { connection });
const curateQueue = new Queue("chatbot-ingest-curate", { connection });
const embedQueue = new Queue("chatbot-ingest-embed", { connection });

// Deterministic job ids make re-adding the same work a no-op via BullMQ's own dedup.
// BullMQ stores job ids inside colon-delimited Redis keys, so the id itself can't contain
// a colon (throws "Custom Id cannot contain :") — use a dash instead.
async function addPullJob(batchId, { sinceDate, untilDate, targetPsid } = {}) {
  await pullQueue.add("pull-batch", { batchId, sinceDate, untilDate, targetPsid }, { jobId: `pull-${batchId}` });
}
async function addParseJob(batchId) {
  await parseQueue.add("parse-batch", { batchId }, { jobId: `parse-${batchId}` });
}
async function addSegmentJob(batchId) {
  await segmentQueue.add("segment-batch", { batchId }, { jobId: `segment-${batchId}` });
}
async function addCurateJob(episodeId) {
  await curateQueue.add("curate-episode", { episodeId }, { jobId: `curate-${episodeId}` });
}
async function addEmbedJob(chunkId) {
  await embedQueue.add("embed-chunk", { chunkId }, { jobId: `embed-${chunkId}` });
}

module.exports = {
  connection,
  pullQueue,
  parseQueue,
  segmentQueue,
  curateQueue,
  embedQueue,
  addPullJob,
  addParseJob,
  addSegmentJob,
  addCurateJob,
  addEmbedJob
};
