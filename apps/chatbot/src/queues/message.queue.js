require("dotenv").config();
const { Queue } = require("bullmq");

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379")
};

const messageQueue = new Queue("chatbot-message", { connection });

// jobId = Meta's message id, so a redelivered webhook event is a no-op instead of a
// duplicate reply.
async function addMessageJob(event) {
  await messageQueue.add("process-message", event, { jobId: event.mid });
}

module.exports = { messageQueue, addMessageJob };
