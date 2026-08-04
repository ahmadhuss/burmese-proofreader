require("dotenv").config();
const { withRetry } = require("../utils/retry");

const EMBEDDING_SERVICE_URL = process.env.EMBEDDING_SERVICE_URL || "http://localhost:5558";
const EMBEDDING_SERVICE_SECRET = process.env.EMBEDDING_SERVICE_SECRET;

// Batches texts through apps/embedding-svc (see docs/rag-chatbot-plan.md §3) and returns
// one embedding vector per input text, in the same order. `type` follows the E5 model
// family's convention: "query" for live user questions, "passage" (default) for knowledge
// being indexed — using the wrong one measurably hurts retrieval quality with E5 models.
async function embedTexts(texts, { type = "passage" } = {}) {
  if (!texts.length) return [];

  return withRetry(
    async () => {
      const res = await fetch(`${EMBEDDING_SERVICE_URL}/embed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Embedding-Secret": EMBEDDING_SERVICE_SECRET
        },
        body: JSON.stringify({ texts, type })
      });

      if (!res.ok) {
        throw new Error(`Embedding service returned ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      return data.vectors;
    },
    { maxAttempts: 3, delayMs: 500, label: "embed" }
  );
}

async function embedText(text, opts) {
  const [vector] = await embedTexts([text], opts);
  return vector;
}

module.exports = { embedTexts, embedText };
