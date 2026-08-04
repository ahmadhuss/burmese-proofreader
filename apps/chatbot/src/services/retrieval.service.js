const { embedText } = require("./embedding.service");
const vectorDb = require("../db/vector");

const TOP_K = parseInt(process.env.RETRIEVAL_TOP_K || "5", 10);

// Embeds the query and runs pgvector similarity search scoped to one client's partition.
async function retrieveContext(clientId, queryText, limit = TOP_K) {
  const embedding = await embedText(queryText, { type: "query" });
  return vectorDb.similaritySearch(clientId, embedding, limit);
}

module.exports = { retrieveContext };
