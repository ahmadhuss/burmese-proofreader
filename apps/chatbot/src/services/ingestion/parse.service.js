const fs = require("fs");
const path = require("path");
const { chain } = require("stream-chain");
const { parser } = require("stream-json");
const { pick } = require("stream-json/filters/Pick");
const { streamArray } = require("stream-json/streamers/StreamArray");
const prisma = require("../../db/prisma");
const logger = require("../../utils/logger");

// Meta's Messenger JSON export has a known bug: non-ASCII text (including Burmese) is
// stored as UTF-8 bytes mis-decoded as Latin-1. Every text field must be re-decoded, or
// the content comes out garbled (docs/rag-chatbot-plan.md §2).
function fixMetaEncoding(str) {
  if (typeof str !== "string") return str;
  return Buffer.from(str, "latin1").toString("utf8");
}

function listThreadFiles(batchDir) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/^message_\d+\.json$/.test(entry.name)) {
        files.push(full);
      }
    }
  }
  walk(batchDir);
  return files;
}

// Meta lays out exports as .../inbox/<thread_dir>/message_N.json — the thread directory
// name is a stable id for that conversation thread.
function threadIdFromFilePath(filePath) {
  return path.basename(path.dirname(filePath));
}

// Streams the `messages` array out of one export file instead of JSON.parse-ing the
// whole thing, to keep memory bounded across export sets at "millions of conversations" scale.
function parseThreadFile(filePath, threadId, batchId, clientName) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const pipeline = chain([fs.createReadStream(filePath), parser(), pick({ filter: "messages" }), streamArray()]);

    pipeline.on("data", ({ value }) => {
      if (!value.content) return; // skip non-text events (reactions, media-only, etc.) for the pilot
      const senderName = fixMetaEncoding(value.sender_name || "unknown");
      rows.push({
        batchId,
        threadId,
        senderName,
        isFromClient: senderName.trim().toLowerCase() === clientName.trim().toLowerCase(),
        content: fixMetaEncoding(value.content),
        timestampMs: BigInt(value.timestamp_ms)
      });
    });
    pipeline.on("end", () => resolve(rows));
    pipeline.on("error", reject);
  });
}

// Stage 1 — parses every thread export file for a batch and upserts RawMessage rows
// (safe to rerun: keyed by thread id + timestamp + sender).
async function parseBatch(batchId) {
  const batch = await prisma.ingestionBatch.findUnique({ where: { id: batchId }, include: { client: true } });
  if (!batch) throw new Error(`IngestionBatch not found: ${batchId}`);

  const files = listThreadFiles(batch.filePath);
  logger.info(`Parsing ${files.length} thread export files`, { batchId });

  let total = 0;
  for (const file of files) {
    const threadId = threadIdFromFilePath(file);
    const rows = await parseThreadFile(file, threadId, batchId, batch.client.name);

    for (const row of rows) {
      await prisma.rawMessage.upsert({
        where: {
          batchId_threadId_timestampMs_senderName: {
            batchId: row.batchId,
            threadId: row.threadId,
            timestampMs: row.timestampMs,
            senderName: row.senderName
          }
        },
        create: row,
        update: {}
      });
    }
    total += rows.length;
  }

  logger.info(`Parsed ${total} raw messages`, { batchId });
  return total;
}

module.exports = { parseBatch, fixMetaEncoding, listThreadFiles };
