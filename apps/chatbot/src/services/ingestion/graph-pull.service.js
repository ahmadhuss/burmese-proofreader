const prisma = require("../../db/prisma");
const logger = require("../../utils/logger");

const GRAPH_API_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || "v21.0";

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    throw new Error(`Graph API error: ${data.error.message} (code ${data.error.code})`);
  }
  return data;
}

// A bare date like "2026-07-20" parses to midnight UTC at the *start* of that day, so using
// it directly as an upper bound would exclude the entire day it names. Bump bare dates
// (no time component) to the end of that day so "until 2026-07-20" means "through", not
// "before", July 20th. A full ISO datetime is left as-is.
function endOfDayIfBareDate(dateStr) {
  const ms = new Date(dateStr).getTime();
  const isBareDate = !dateStr.includes("T");
  return isBareDate ? ms + 24 * 60 * 60 * 1000 - 1 : ms;
}

// Alternative to Stage 1 (src/services/ingestion/parse.service.js): a Facebook Page's own
// Messenger history has no manual "download your information" export the way a personal
// account does, so this pulls it directly via the Graph API's Conversations connection
// and writes the same RawMessage shape the rest of the pipeline (segment/curate/embed)
// already expects — everything downstream is unchanged.
async function pullConversationsFromGraph(batchId, { sinceDate, untilDate, targetPsid } = {}) {
  const batch = await prisma.ingestionBatch.findUnique({ where: { id: batchId }, include: { client: true } });
  if (!batch) throw new Error(`IngestionBatch not found: ${batchId}`);

  const sinceMs = sinceDate ? new Date(sinceDate).getTime() : 0;
  const untilMs = untilDate ? endOfDayIfBareDate(untilDate) : Infinity;
  const pageId = batch.client.facebookPageId;
  const token = batch.client.pageAccessToken;

  // user_id filters the Conversations connection down to just the one thread with that
  // person, instead of pulling every conversation on the Page.
  const userIdFilter = targetPsid ? `&user_id=${encodeURIComponent(targetPsid)}` : "";
  let conversationsUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/conversations?fields=id,participants&limit=50${userIdFilter}&access_token=${encodeURIComponent(token)}`;

  let totalMessages = 0;
  let totalThreads = 0;

  while (conversationsUrl) {
    const page = await fetchJson(conversationsUrl);

    for (const conversation of page.data || []) {
      const threadId = conversation.id;
      let messagesUrl = `https://graph.facebook.com/${GRAPH_API_VERSION}/${threadId}/messages?fields=message,from,created_time&limit=100&access_token=${encodeURIComponent(token)}`;
      let threadHadMessages = false;

      while (messagesUrl) {
        const msgPage = await fetchJson(messagesUrl);

        for (const msg of msgPage.data || []) {
          if (!msg.message) continue;
          const timestampMs = BigInt(new Date(msg.created_time).getTime());
          if (Number(timestampMs) < sinceMs || Number(timestampMs) > untilMs) continue;

          const isFromClient = msg.from?.id === pageId;
          const senderName = msg.from?.name || (isFromClient ? batch.client.name : "customer");

          await prisma.rawMessage.upsert({
            where: {
              batchId_threadId_timestampMs_senderName: { batchId, threadId, timestampMs, senderName }
            },
            create: { batchId, threadId, senderName, isFromClient, content: msg.message, timestampMs },
            update: {}
          });
          totalMessages++;
          threadHadMessages = true;
        }

        messagesUrl = msgPage.paging?.next || null;
      }

      if (threadHadMessages) totalThreads++;
    }

    conversationsUrl = page.paging?.next || null;
  }

  logger.info(`Pulled ${totalMessages} messages across ${totalThreads} threads from Graph API`, { batchId, sinceDate, untilDate });
  return { totalMessages, totalThreads };
}

module.exports = { pullConversationsFromGraph };
