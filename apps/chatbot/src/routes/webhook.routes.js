const express = require("express");
const logger = require("../utils/logger");
const { verifySignature, parseWebhookEvents } = require("../services/messenger.service");
const { getClientByPageId } = require("../services/client.service");
const { addMessageJob } = require("../queues/message.queue");

const router = express.Router();

const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;

// Meta's one-time webhook verification handshake, done when registering the webhook URL.
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ACKs 200 immediately and enqueues the real work (docs/rag-chatbot-plan.md §4), so Meta
// never sees a slow response or triggers a redundant retry.
router.post("/", async (req, res) => {
  res.sendStatus(200);

  const events = parseWebhookEvents(req.body);
  for (const event of events) {
    try {
      const client = await getClientByPageId(event.pageId);
      if (!client) {
        logger.warn("Webhook event for unknown Facebook Page", { pageId: event.pageId });
        continue;
      }

      const signatureHeader = req.get("X-Hub-Signature-256");
      if (!verifySignature(req.rawBody, signatureHeader, client.appSecret)) {
        logger.warn("Webhook signature verification failed", { pageId: event.pageId });
        continue;
      }

      await addMessageJob(event);
    } catch (err) {
      logger.error("Failed to enqueue webhook event", { error: err.message });
    }
  }
});

module.exports = router;
