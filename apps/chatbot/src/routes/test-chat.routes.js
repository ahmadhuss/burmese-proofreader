const express = require("express");
const prisma = require("../db/prisma");
const { generateReplyForClient } = require("../services/reply.service");

const router = express.Router();

// Local test harness only (see server.js — mounted only outside production, or with
// ENABLE_TEST_ROUTES=true). Runs the exact same RAG pipeline as the live Messenger
// worker but returns the reply directly instead of sending it via the Facebook Send API,
// so retrieval + DeepSeek can be exercised without a real Page/webhook set up.
router.post("/", async (req, res, next) => {
  try {
    const { clientId, psid, text } = req.body;
    if (!clientId || !psid || !text) {
      return res.status(400).json({ error: "clientId, psid, and text are required" });
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return res.status(404).json({ error: "Client not found" });

    const result = await generateReplyForClient({ client, psid, text });

    res.json({
      replyText: result.replyText,
      confidence: result.confidence,
      escalate: result.escalate,
      retrievedChunks: result.contextChunks,
      timings: result.timings
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
