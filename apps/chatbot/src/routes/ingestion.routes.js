const express = require("express");
const prisma = require("../db/prisma");
const { addParseJob, addPullJob } = require("../queues/ingest.queue");

const router = express.Router();

// Registers a batch of already-uploaded Meta export files (multi-GB exports aren't
// practical over HTTP, so filePath points at a directory already on the server — see
// src/cli/backfill.js for the equivalent CLI path) and kicks off Stage 1 parsing.
router.post("/batches", async (req, res, next) => {
  try {
    const { clientId, filePath } = req.body;
    if (!clientId || !filePath) {
      return res.status(400).json({ error: "clientId and filePath are required" });
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: "Client not found" });

    const batch = await prisma.ingestionBatch.create({ data: { clientId, filePath, status: "UPLOADED" } });
    await addParseJob(batch.id);

    res.status(201).json({ batchId: batch.id, status: batch.status });
  } catch (err) {
    next(err);
  }
});

// Pulls a Facebook Page's real conversation history via the Graph API (no manual export
// file needed — see src/services/ingestion/graph-pull.service.js) and queues it through
// the same segment -> curate -> embed pipeline as a file-based batch. Optionally scoped to
// one Messenger user via psid instead of the whole Page.
router.post("/pull-conversations", async (req, res, next) => {
  try {
    const { clientId, sinceDate, untilDate, psid } = req.body;
    if (!clientId) {
      return res.status(400).json({ error: "clientId is required" });
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: "Client not found" });

    const rangeSuffix = `:since=${sinceDate || "2026-01-01"}${untilDate ? `:until=${untilDate}` : ""}`;
    const batch = await prisma.ingestionBatch.create({
      data: {
        clientId,
        filePath: `graph-api:${client.facebookPageId}${psid ? `:psid=${psid}` : ""}${rangeSuffix}`,
        status: "UPLOADED"
      }
    });
    await addPullJob(batch.id, { sinceDate, untilDate, targetPsid: psid });

    res.status(201).json({ batchId: batch.id, status: batch.status });
  } catch (err) {
    next(err);
  }
});

router.get("/batches/:id", async (req, res, next) => {
  try {
    const batch = await prisma.ingestionBatch.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { rawMessages: true, episodes: true } } }
    });
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    res.json(batch);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
