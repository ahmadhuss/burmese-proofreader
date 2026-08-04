require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const logger = require("./utils/logger");

const webhookRoutes = require("./routes/webhook.routes");
const clientsRoutes = require("./routes/clients.routes");
const ingestionRoutes = require("./routes/ingestion.routes");
const docsRoutes = require("./routes/docs.routes");
const { openapiSpec } = require("./openapi");

// Local test harness (seed data + /public/test-chat.html) — never exposed in production
// unless explicitly opted into, since it lets anyone who can reach it query any clientId's
// knowledge base and spend DeepSeek tokens with no auth.
const TEST_ROUTES_ENABLED = process.env.NODE_ENV !== "production" || process.env.ENABLE_TEST_ROUTES === "true";

const app = express();
app.use(compression());
app.disable("x-powered-by");
const PORT = process.env.PORT || 5557;

app.get("/openapi.json", (req, res) => res.json(openapiSpec));
app.use("/docs", docsRoutes);

app.use(helmet());
app.use(cors());

// Capture the raw body for Messenger webhook signature verification — must happen before
// JSON parsing consumes the request stream (see services/messenger.service.js:verifySignature).
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    }
  })
);

app.use("/webhook", webhookRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/ingestion", ingestionRoutes);

if (TEST_ROUTES_ENABLED) {
  const testChatRoutes = require("./routes/test-chat.routes");
  app.use("/api/test-chat", testChatRoutes);
  app.use(express.static(path.join(__dirname, "..", "public")));
  logger.info("Test routes enabled — /test-chat.html and /api/test-chat are live");
}

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use((err, req, res, next) => {
  logger.error("Unhandled error", { error: err.message });
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  logger.info(`Chatbot API server running on port ${PORT}`);
});
