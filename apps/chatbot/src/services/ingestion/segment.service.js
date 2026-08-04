const prisma = require("../../db/prisma");
const logger = require("../../utils/logger");

const IDLE_GAP_MS = parseInt(process.env.EPISODE_IDLE_GAP_MS || String(4 * 60 * 60 * 1000), 10);

// Stage 2 — groups a thread's RawMessage rows into ConversationEpisodes by idle-time gap,
// bounding the unit of work later sent to DeepSeek for curation.
async function segmentBatch(batchId) {
  const messages = await prisma.rawMessage.findMany({
    where: { batchId, episodeId: null },
    orderBy: [{ threadId: "asc" }, { timestampMs: "asc" }]
  });

  const byThread = new Map();
  for (const msg of messages) {
    if (!byThread.has(msg.threadId)) byThread.set(msg.threadId, []);
    byThread.get(msg.threadId).push(msg);
  }

  let episodeCount = 0;

  for (const [threadId, threadMessages] of byThread) {
    let current = [];

    const flush = async () => {
      if (!current.length) return;
      const episode = await prisma.conversationEpisode.create({
        data: {
          batchId,
          threadId,
          startedAt: new Date(Number(current[0].timestampMs)),
          endedAt: new Date(Number(current[current.length - 1].timestampMs))
        }
      });
      await prisma.rawMessage.updateMany({
        where: { id: { in: current.map(m => m.id) } },
        data: { episodeId: episode.id }
      });
      episodeCount++;
      current = [];
    };

    for (const msg of threadMessages) {
      if (current.length) {
        const gap = Number(msg.timestampMs) - Number(current[current.length - 1].timestampMs);
        if (gap > IDLE_GAP_MS) await flush();
      }
      current.push(msg);
    }
    await flush();
  }

  logger.info(`Segmented batch into ${episodeCount} episodes`, { batchId });
  return episodeCount;
}

module.exports = { segmentBatch };
