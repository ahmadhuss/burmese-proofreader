require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const logger = require("./utils/logger");

const { createBullBoard } = require("@bull-board/api");
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const { bookQueue } = require("./queues/book.queue");

const uploadRoutes = require("./routes/upload.routes");
const jobsRoutes = require("./routes/jobs.routes");
const filesRoutes = require("./routes/files.routes");

const app = express();
app.disable("x-powered-by");
const PORT = process.env.PORT || 5556;

// Bull Board queue dashboard
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(bookQueue)],
  serverAdapter
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("/admin/queues", serverAdapter.getRouter());
app.use("/api/upload", uploadRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/files", filesRoutes);

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use((err, req, res, next) => {
  logger.error("Unhandled error", { error: err.message });
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  logger.info(`API server running on port ${PORT}`);
  logger.info(`Bull Board available at http://localhost:${PORT}/admin/queues`);
});
