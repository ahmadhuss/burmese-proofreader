const crypto = require("crypto");
const logger = require("../utils/logger");
const { withRetry } = require("../utils/retry");

const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || "v21.0";

// Verifies Meta's X-Hub-Signature-256 header against the client's app secret, using the
// exact raw request body bytes (must be captured before JSON body-parsing mutates it).
function verifySignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

async function sendMessage({ pageAccessToken, psid, text }) {
  return withRetry(
    async () => {
      const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: psid },
          message: { text },
          messaging_type: "RESPONSE"
        })
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Messenger Send API returned ${res.status}: ${body}`);
      }

      return res.json();
    },
    { maxAttempts: 3, delayMs: 1000, label: "messenger-send" }
  );
}

// Extracts the flat list of {pageId, psid, mid, text, timestamp} events from Meta's
// webhook payload shape. Non-text events (attachments, read receipts, etc.) are skipped
// for the pilot.
function parseWebhookEvents(payload) {
  const events = [];
  for (const entry of payload.entry || []) {
    const pageId = entry.id;
    for (const messaging of entry.messaging || []) {
      if (!messaging.message?.text || messaging.message.is_echo) continue;
      events.push({
        pageId,
        psid: messaging.sender.id,
        mid: messaging.message.mid,
        text: messaging.message.text,
        timestamp: messaging.timestamp
      });
    }
  }
  return events;
}

module.exports = { verifySignature, sendMessage, parseWebhookEvents };
