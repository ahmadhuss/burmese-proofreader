const prisma = require("../db/prisma");

const HISTORY_LIMIT = parseInt(process.env.CONVERSATION_HISTORY_LIMIT || "10", 10);

async function getOrCreateSession(clientId, psid) {
  return prisma.conversationSession.upsert({
    where: { clientId_psid: { clientId, psid } },
    create: { clientId, psid },
    update: {}
  });
}

async function getRecentHistory(sessionId) {
  const messages = await prisma.conversationMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT
  });
  return messages.reverse();
}

async function recordTurn({ sessionId, userText, userMid, replyText, retrievedChunkIds }) {
  await prisma.$transaction([
    prisma.conversationMessage.create({
      data: { sessionId, role: "user", content: userText, mid: userMid }
    }),
    prisma.conversationMessage.create({
      data: { sessionId, role: "assistant", content: replyText, retrievedChunkIds }
    }),
    prisma.conversationSession.update({
      where: { id: sessionId },
      data: { lastMessageAt: new Date() }
    })
  ]);
}

async function markEscalated(sessionId) {
  await prisma.conversationSession.update({
    where: { id: sessionId },
    data: { status: "ESCALATED" }
  });
}

module.exports = { getOrCreateSession, getRecentHistory, recordTurn, markEscalated };
