#!/usr/bin/env node
// Pulls a Page's real Messenger conversation history via the Graph API (no manual export
// file needed, unlike src/cli/backfill.js which expects Meta's DTI export format).
// Thin wrapper around the same POST /api/ingestion/pull-conversations code path — queues
// the pull + segment -> curate -> embed pipeline and returns immediately.
require("dotenv").config();
const prisma = require("../db/prisma");
const { addPullJob } = require("../queues/ingest.queue");
const logger = require("../utils/logger");

async function main() {
  const [, , clientId, sinceDate, untilDate, psid] = process.argv;
  if (!clientId) {
    console.error("Usage: node src/cli/pull-conversations.js <clientId> [sinceDate=2026-01-01] [untilDate] [psid]");
    console.error("  sinceDate/untilDate: only pull messages within this date range (untilDate optional, defaults to now).");
    console.error("  psid: optional — pull only the one conversation thread with this Facebook user, instead of every conversation on the Page.");
    process.exit(1);
  }
  const since = sinceDate || "2026-01-01";

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    console.error(`No Client found with id ${clientId}`);
    process.exit(1);
  }

  const rangeSuffix = `:since=${since}${untilDate ? `:until=${untilDate}` : ""}`;
  const batch = await prisma.ingestionBatch.create({
    data: {
      clientId,
      filePath: `graph-api:${client.facebookPageId}${psid ? `:psid=${psid}` : ""}${rangeSuffix}`,
      status: "UPLOADED"
    }
  });
  await addPullJob(batch.id, { sinceDate: since, untilDate, targetPsid: psid });

  logger.info("Queued Graph API pull", { batchId: batch.id, since, until: untilDate || "(now)", psid: psid || "(all)" });
  console.log(`
Batch ${batch.id} queued (pull -> segment -> curate -> embed).
Range: ${since} to ${untilDate || "now"}${psid ? `, psid ${psid}` : ""}
Watch progress:  curl http://localhost:5557/api/ingestion/batches/${batch.id}
`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
