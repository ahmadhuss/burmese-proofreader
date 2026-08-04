const express = require("express");
const prisma = require("../db/prisma");
const { createClientPartition } = require("../db/partitions");

const router = express.Router();

// Onboards a new client (Facebook Page/bot) and provisions its KnowledgeChunk partition +
// HNSW index (docs/rag-chatbot-plan.md §1) so its retrieval is isolated from day one.
router.post("/", async (req, res, next) => {
  try {
    const { name, facebookPageId, pageAccessToken, appSecret, systemPrompt, embeddingModel } = req.body;
    if (!name || !facebookPageId || !pageAccessToken || !appSecret || !systemPrompt) {
      return res.status(400).json({ error: "name, facebookPageId, pageAccessToken, appSecret, and systemPrompt are required" });
    }

    const client = await prisma.client.create({
      data: { name, facebookPageId, pageAccessToken, appSecret, systemPrompt, embeddingModel }
    });

    await createClientPartition(client.id);

    res.status(201).json({ id: client.id, name: client.name, facebookPageId: client.facebookPageId });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, facebookPageId: true, status: true, embeddingModel: true, createdAt: true }
    });
    if (!client) return res.status(404).json({ error: "Client not found" });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
