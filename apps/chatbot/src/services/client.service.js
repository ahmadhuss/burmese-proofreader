const prisma = require("../db/prisma");

async function getClientByPageId(pageId) {
  return prisma.client.findUnique({ where: { facebookPageId: pageId } });
}

module.exports = { getClientByPageId };
