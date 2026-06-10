require("dotenv").config();
const { Worker } = require("bullmq");
const path = require("path");
const prisma = require("../db/prisma");
const logger = require("../utils/logger");
const { withRetry } = require("../utils/retry");
const { jobOutputDir } = require("../utils/file");
const { extractText } = require("../services/extract-text.service");
const { buildChunks } = require("../services/chunk.service");
const { correctChunk } = require("../services/deepseek.service");
const { scanChunkForWarnings, aggregateWarnings } = require("../services/warning-scan.service");
const { generateDocx, generateTxt } = require("../services/docx-builder.service");

const connection = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379")
};

const CONCURRENCY = parseInt(process.env.CHUNK_CONCURRENCY || "2");

// Live progress notes for the user. Each note is also saved to the database.
const logBuffers = {};

async function appendLog(jobId, msg, level = "info") {
  if (!logBuffers[jobId]) logBuffers[jobId] = [];
  const entry = { ts: new Date().toISOString(), msg, level };
  logBuffers[jobId].push(entry);
  logger[level]?.(msg, { jobId });

  try {
    await prisma.bookJob.update({
      where: { id: jobId },
      data: { processingLog: JSON.stringify(logBuffers[jobId]) }
    });
  } catch (err) {
    logger.warn("Failed to persist log entry", { jobId, error: err.message });
  }
}

async function processBook(job) {
  const { jobId } = job.data;

  try {
    const bookJob = await prisma.bookJob.findUnique({ where: { id: jobId } });
    if (!bookJob) throw new Error(`BookJob not found: ${jobId}`);

    await appendLog(jobId, `Starting job — model: ${bookJob.modelName} | thinking: ${bookJob.thinkingEnabled ? `on (${bookJob.reasoningEffort})` : "off"}`);

    // Step 1: pull plain text out of the uploaded file.
    await prisma.bookJob.update({ where: { id: jobId }, data: { status: "EXTRACTING" } });
    await appendLog(jobId, `Extracting text from "${bookJob.fileName}"…`);

    let rawText;
    try {
      rawText = await extractText(bookJob.filePath, bookJob.fileType);
      await appendLog(jobId, `Extracted ${rawText.length.toLocaleString()} characters`);
    } catch (err) {
      await appendLog(jobId, `Text extraction failed: ${err.message}`, "error");
      await prisma.bookJob.update({ where: { id: jobId }, data: { status: "FAILED", errorMessage: err.message } });
      throw err;
    }

    // Step 2: divide the book into pieces small enough for safe AI editing.
    await prisma.bookJob.update({ where: { id: jobId }, data: { status: "SPLITTING" } });
    await appendLog(jobId, "Splitting text into chunks…");
    const chunks = buildChunks(rawText);
    await appendLog(jobId, `Split into ${chunks.length} chunks`);

    // Store every piece, so progress can resume and the frontend can show live previews.
    await prisma.$transaction(
      chunks.map(c =>
        prisma.bookChunk.upsert({
          where: { jobId_chunkIndex: { jobId, chunkIndex: c.chunkIndex } },
          create: { jobId, chunkIndex: c.chunkIndex, chapterTitle: c.chapterTitle, originalText: c.originalText },
          update: {}
        })
      )
    );
    await prisma.bookJob.update({ where: { id: jobId }, data: { status: "PROCESSING", totalChunks: chunks.length } });

    // Step 3: correct each piece and keep successful pieces as they finish.
    const pendingChunks = await prisma.bookChunk.findMany({
      where: { jobId, status: { in: ["PENDING", "FAILED"] } },
      orderBy: { chunkIndex: "asc" }
    });

    const model = bookJob.modelName;
    const aiOpts = {
      thinkingEnabled: bookJob.thinkingEnabled ?? false,
      reasoningEffort: bookJob.reasoningEffort || "high"
    };
    const warningResults = [];

    async function processOneChunk(dbChunk) {
      const label = `Chunk ${dbChunk.chunkIndex + 1}/${chunks.length}`;
      await appendLog(jobId, `${label}: sending to DeepSeek (${dbChunk.originalText.length} chars)…`);
      await prisma.bookChunk.update({ where: { id: dbChunk.id }, data: { status: "PROCESSING" } });

      try {
        const corrected = await withRetry(
          async attempt => {
            const retryCount = attempt - 1;
            if (retryCount > 0) {
              await appendLog(jobId, `${label}: retry ${retryCount}…`, "warn");
            }
            if (retryCount >= 2 && dbChunk.originalText.length > 3000) {
              await appendLog(jobId, `${label}: splitting into sub-chunks for retry…`, "warn");
              const half = Math.floor(dbChunk.originalText.length / 2);
              const parts = [{ originalText: dbChunk.originalText.slice(0, half) }, { originalText: dbChunk.originalText.slice(half) }];
              const correctedParts = await Promise.all(parts.map(p => correctChunk(p, 1, model, aiOpts)));
              return correctedParts.join("\n\n");
            }
            return correctChunk(dbChunk, retryCount, model, aiOpts);
          },
          { maxAttempts: 3, delayMs: 2000, label }
        );

        await appendLog(jobId, `${label}: correction done (${corrected.length} chars)`);

        // Warning scan is helpful, but it should not block a corrected book.
        try {
          await appendLog(jobId, `${label}: running content warning scan…`);
          const warning = await scanChunkForWarnings(corrected, model, aiOpts);
          warningResults.push(warning);
          const flags = ["political", "adultSexual", "bl"].filter(k => warning[k]?.found);
          if (flags.length) {
            await appendLog(jobId, `${label}: ⚠ warnings detected: ${flags.join(", ")}`, "warn");
          }
        } catch (_) {}

        await prisma.bookChunk.update({
          where: { id: dbChunk.id },
          data: { correctedText: corrected, status: "COMPLETED", retryCount: 0 }
        });
        await prisma.bookJob.update({ where: { id: jobId }, data: { completedChunks: { increment: 1 } } });
      } catch (err) {
        await appendLog(jobId, `${label}: failed — ${err.message}`, "error");
        await prisma.bookChunk.update({
          where: { id: dbChunk.id },
          data: { status: "FAILED", errorMessage: err.message, retryCount: { increment: 1 } }
        });
        await prisma.bookJob.update({ where: { id: jobId }, data: { failedChunks: { increment: 1 } } });
      }
    }

    // Process a few chunks at a time so the API stays steady under large books.
    for (let i = 0; i < pendingChunks.length; i += CONCURRENCY) {
      const batch = pendingChunks.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(processOneChunk));
    }

    // Step 4: stitch all pieces back into downloadable files.
    await appendLog(jobId, "All chunks processed — generating output files…");
    await prisma.bookJob.update({ where: { id: jobId }, data: { status: "GENERATING_OUTPUT" } });

    const completedChunks = await prisma.bookChunk.findMany({
      where: { jobId },
      orderBy: { chunkIndex: "asc" }
    });

    const outputDir = jobOutputDir(jobId);
    const txtPath = path.join(outputDir, "final.txt");
    const docxPath = path.join(outputDir, "final.docx");

    await generateTxt(completedChunks, txtPath);
    await appendLog(jobId, "Generated final.txt");
    await generateDocx(completedChunks, docxPath);
    await appendLog(jobId, "Generated final.docx");

    const warningSummary = aggregateWarnings(warningResults);
    const failedCount = completedChunks.filter(c => c.status === "FAILED").length;
    const finalStatus = failedCount > 0 ? "PARTIALLY_COMPLETED" : "COMPLETED";

    await prisma.bookJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        outputTxtPath: txtPath,
        outputDocxPath: docxPath,
        warningSummary: JSON.stringify(warningSummary)
      }
    });

    await appendLog(jobId, `Job ${finalStatus} — ${completedChunks.length - failedCount}/${completedChunks.length} chunks succeeded`);
  } finally {
    delete logBuffers[jobId];
  }
}

const worker = new Worker(
  "book-processing",
  async job => {
    await processBook(job);
  },
  { connection, concurrency: 1 }
);

worker.on("completed", job => logger.info("BullMQ job completed", { bullJobId: job.id }));
worker.on("failed", (job, err) => logger.error("BullMQ job failed", { bullJobId: job?.id, error: err.message }));

logger.info("Book worker started");
