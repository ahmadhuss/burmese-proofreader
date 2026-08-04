#!/usr/bin/env node
// Local dev helper only: creates a demo Client + a handful of already-curated Q&A
// KnowledgeChunk rows, embedded and marked READY, so retrieval + the test-chat UI
// (public/test-chat.html) work immediately without needing a real Meta export to run
// through the full ingestion pipeline (see src/cli/backfill.js for that path). Requires
// apps/embedding-svc to be running.
require("dotenv").config();
const prisma = require("../db/prisma");
const { createClientPartition } = require("../db/partitions");
const { embedText } = require("../services/embedding.service");
const vectorDb = require("../db/vector");
const logger = require("../utils/logger");

const SAMPLE_CHUNKS = [
  { question: "What are your shipping times?", answer: "Standard shipping takes 3-5 business days within the country; express shipping takes 1-2 business days.", category: "shipping" },
  { question: "Do you ship internationally?", answer: "Yes, we ship to most countries. International orders typically take 7-14 business days.", category: "shipping" },
  { question: "What is your return policy?", answer: "You can return any unused item within 30 days of delivery for a full refund. Contact support to start a return.", category: "returns" },
  { question: "How do I track my order?", answer: "Once your order ships, you'll receive a tracking link over Messenger. You can also ask us for your tracking number anytime.", category: "orders" },
  { question: "What payment methods do you accept?", answer: "We accept credit/debit cards, mobile banking, and cash on delivery in supported areas.", category: "payments" },
  { question: "Can I change or cancel my order after placing it?", answer: "Orders can be changed or cancelled within 1 hour of placing them. After that, the order may already be processing.", category: "orders" }
];

async function main() {
  const pageId = process.argv[2] || "demo-page-local";

  let client = await prisma.client.findUnique({ where: { facebookPageId: pageId } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        name: "Demo Store",
        facebookPageId: pageId,
        pageAccessToken: "demo-token",
        appSecret: "demo-secret",
        systemPrompt: "You are a friendly customer support assistant for Demo Store, a small online shop. Answer using only the provided knowledge. Be concise."
      }
    });
    logger.info("Created demo client", { clientId: client.id, pageId });
  } else {
    logger.info("Reusing existing demo client", { clientId: client.id, pageId });
  }

  // Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) — always ensured, not just on first
  // creation, so a seed rerun after a earlier partial failure still provisions it.
  await createClientPartition(client.id);

  // Per-item, not all-or-nothing: a chunk already READY is left alone; anything missing
  // or stuck PENDING_EMBED (e.g. from a run that failed mid-way, like a dead embedding
  // service) gets (re)created and embedded. Safe to run repeatedly.
  const existingReady = await prisma.knowledgeChunk.findMany({
    where: { clientId: client.id, status: "READY" },
    select: { question: true }
  });
  const readyQuestions = new Set(existingReady.map(c => c.question));

  let seeded = 0;
  for (const item of SAMPLE_CHUNKS) {
    if (readyQuestions.has(item.question)) continue;

    const stale = await prisma.knowledgeChunk.findFirst({
      where: { clientId: client.id, question: item.question, status: { not: "READY" } }
    });
    if (stale) await prisma.knowledgeChunk.delete({ where: { id: stale.id } });

    const created = await prisma.knowledgeChunk.create({
      data: { clientId: client.id, question: item.question, answer: item.answer, category: item.category, status: "PENDING_EMBED" }
    });
    const embedding = await embedText(`${item.question}\n${item.answer}`);
    await vectorDb.setEmbedding(created.id, client.id, embedding);
    seeded++;
  }
  logger.info(`Seeded ${seeded} new knowledge chunks (${readyQuestions.size} already ready)`, { clientId: client.id });

  console.log(`
Demo client ready.
  clientId:       ${client.id}
  facebookPageId: ${pageId}

Try it at:  http://localhost:${process.env.PORT || 5557}/test-chat.html
  (paste the clientId above into the "clientId" field)

Or via curl:
  curl -X POST http://localhost:${process.env.PORT || 5557}/api/test-chat \\
    -H "Content-Type: application/json" \\
    -d '{"clientId":"${client.id}","psid":"test-user-1","text":"What is your return policy?"}'
`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
