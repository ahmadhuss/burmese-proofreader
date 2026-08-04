require("dotenv").config();
const { Worker } = require("bullmq");
const logger = require("../utils/logger");
const { getClientByPageId } = require("../services/client.service");
const { generateReplyForClient } = require("../services/reply.service");
const { sendMessage } = require("../services/messenger.service");

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379")
};

const CONCURRENCY = parseInt(process.env.MESSAGE_CONCURRENCY || "5", 10);

// docs/rag-chatbot-plan.md §4 — one BullMQ job per inbound Messenger text message.
async function processMessage(job) {
  const { pageId, psid, mid, text } = job.data;

  const client = await getClientByPageId(pageId);
  if (!client) {
    logger.error("No Client configured for incoming Facebook Page", { pageId });
    return;
  }
  if (client.status !== "ACTIVE") {
    logger.info("Ignoring message for inactive client", { clientId: client.id, pageId });
    return;
  }

  const { replyText } = await generateReplyForClient({ client, psid, text, mid });

  await sendMessage({ pageAccessToken: client.pageAccessToken, psid, text: replyText });
}

const worker = new Worker("chatbot-message", processMessage, { connection, concurrency: CONCURRENCY });

worker.on("completed", job => logger.info("Message job completed", { bullJobId: job.id }));
worker.on("failed", (job, err) => logger.error("Message job failed", { bullJobId: job?.id, error: err.message }));

logger.info("Chatbot message worker started");
