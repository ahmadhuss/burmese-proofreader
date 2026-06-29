const express = require("express");
const fs = require("fs");
const prisma = require("../db/prisma");
const { addBookJob, bookQueue } = require("../queues/book.queue");
const { resolveUploadDir, resolveOutputDir } = require("../utils/file");
const logger = require("../utils/logger");
const { sendJson, validate } = require("../validation/middleware");
const { jobParamsSchema } = require("../validation/schemas");
const {
  jobPreviewSchema,
  jobResultSchema,
  jobsListResponseSchema,
  jobStatusSchema,
  messageResponseSchema,
  pendingResultSchema,
  retryResponseSchema
} = require("../validation/response-schemas");

const router = express.Router();

router.get("/", async (req, res) => {
  const jobs = await prisma.bookJob.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      status: true,
      modelName: true,
      totalChunks: true,
      completedChunks: true,
      failedChunks: true,
      warningSummary: true,
      createdAt: true,
      updatedAt: true
    }
  });
  sendJson(res, jobsListResponseSchema, {
    jobs: jobs.map(j => ({
      ...j,
      warningSummary: j.warningSummary ? JSON.parse(j.warningSummary) : null
    }))
  }, "jobs list response");
});

router.delete("/", async (req, res) => {
  try {
    // 1. Wipe all DB records (cascade deletes BookChunk rows too)
    await prisma.bookJob.deleteMany();

    // 2. Obliterate the queue (removes all jobs in every state)
    await bookQueue.obliterate({ force: true });

    // 3. Clear uploaded files (recreate empty dir)
    const uploadDir = resolveUploadDir();
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
    fs.mkdirSync(uploadDir, { recursive: true });

    // 4. Clear output files (recreate empty dir)
    const outputDir = resolveOutputDir();
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });

    logger.info("All data cleared");
    sendJson(res, messageResponseSchema, { message: "All data cleared" }, "clear data response");
  } catch (err) {
    logger.error("Clear all failed", { error: err.message });
    res.status(500).json({ error: "Failed to clear data" });
  }
});

router.get("/:jobId", validate("params", jobParamsSchema), async (req, res) => {
  const { jobId } = req.params;
  const job = await prisma.bookJob.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: "Job not found" });

  const progressPercent = job.totalChunks > 0 ? Math.round((job.completedChunks / job.totalChunks) * 100) : 0;

  sendJson(res, jobStatusSchema, {
    id: job.id,
    status: job.status,
    fileName: job.fileName,
    modelName: job.modelName,
    totalChunks: job.totalChunks,
    completedChunks: job.completedChunks,
    failedChunks: job.failedChunks,
    progressPercent,
    errorMessage: job.errorMessage,
    processingLog: job.processingLog ? JSON.parse(job.processingLog) : []
  }, "job status response");
});

router.get("/:jobId/result", validate("params", jobParamsSchema), async (req, res) => {
  const { jobId } = req.params;
  const job = await prisma.bookJob.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: "Job not found" });

  const DONE_STATUSES = ["COMPLETED", "PARTIALLY_COMPLETED"];
  if (!DONE_STATUSES.includes(job.status)) {
    return sendJson(res.status(202), pendingResultSchema, { status: job.status, message: "Job not yet complete" }, "pending result response");
  }

  const warningSummary = job.warningSummary
    ? JSON.parse(job.warningSummary)
    : {
        political: { found: false, severity: "none", notes: [] },
        adultSexual: { found: false, severity: "none", notes: [] },
        bl: { found: false, severity: "none", notes: [] }
      };

  sendJson(res, jobResultSchema, {
    status: job.status,
    outputTxtUrl: `/api/files/${jobId}/final.txt`,
    outputDocxUrl: `/api/files/${jobId}/final.docx`,
    warningSummary
  }, "job result response");
});

router.get("/:jobId/preview", validate("params", jobParamsSchema), async (req, res) => {
  const { jobId } = req.params;
  const job = await prisma.bookJob.findUnique({ where: { id: jobId }, select: { id: true, status: true, totalChunks: true, completedChunks: true } });
  if (!job) return res.status(404).json({ error: "Job not found" });

  const chunks = await prisma.bookChunk.findMany({
    where: { jobId, status: "COMPLETED" },
    orderBy: { chunkIndex: "asc" },
    select: { chunkIndex: true, chapterTitle: true, correctedText: true }
  });

  sendJson(res, jobPreviewSchema, {
    status: job.status,
    totalChunks: job.totalChunks,
    completedChunks: job.completedChunks,
    chunks
  }, "job preview response");
});

router.post("/:jobId/retry", validate("params", jobParamsSchema), async (req, res) => {
  const { jobId } = req.params;
  const job = await prisma.bookJob.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: "Job not found" });

  // Reset failed chunks to PENDING
  await prisma.bookChunk.updateMany({
    where: { jobId, status: "FAILED" },
    data: { status: "PENDING", errorMessage: null }
  });

  await prisma.bookJob.update({
    where: { id: jobId },
    data: { status: "PROCESSING", failedChunks: 0 }
  });

  await addBookJob(jobId);
  logger.info("Retry started", { jobId });

  sendJson(res, retryResponseSchema, { message: "Retry started", jobId }, "retry response");
});

module.exports = router;
