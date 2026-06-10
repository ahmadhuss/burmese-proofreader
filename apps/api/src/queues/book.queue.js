require("dotenv").config();
const { Queue } = require("bullmq");

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379")
};

const bookQueue = new Queue("book-processing", { connection });

async function addBookJob(jobId) {
  await bookQueue.add("process-book", { jobId }, { jobId: `${jobId}-${Date.now()}` });
}

module.exports = { bookQueue, addBookJob };
