const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { resolveUploadDir, ensureDir } = require("../utils/file");
const prisma = require("../db/prisma");
const { addBookJob } = require("../queues/book.queue");
const logger = require("../utils/logger");
const { sendJson, validate } = require("../validation/middleware");
const { uploadHeadersSchema } = require("../validation/schemas");
const { uploadDryRunResponseSchema, uploadResponseSchema } = require("../validation/response-schemas");

const router = express.Router();

const ALLOWED_EXTENSIONS = [".docx", ".pdf", ".txt"];

// Uploaded books are stored on disk; the database keeps the path and job status.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = resolveUploadDir();
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || "100") * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`));
    }
  }
});

function isDocsDryRun(req) {
  return req.get("X-Docs-Dry-Run") === "true";
}

// Creates the book job, then hands it to the background worker.
router.post("/", validate("headers", uploadHeadersSchema), upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const ext = path.extname(req.file.originalname).toLowerCase().replace(".", "");

  if (isDocsDryRun(req)) {
    try {
      if (req.file.path) {
        fs.unlinkSync(req.file.path);
      }
    } catch (err) {
      logger.warn("Failed to remove docs dry-run upload", { path: req.file.path, error: err.message });
    }

    logger.info("Docs dry-run upload validated without queueing job", { file: req.file.originalname });

    return sendJson(res, uploadDryRunResponseSchema, {
      jobId: "docs-dry-run",
      status: "DRY_RUN",
      message: "Upload validated by API docs playground. No real job was created and no processing was queued."
    }, "upload dry-run response");
  }

  // AI settings are controlled by the server, not by hidden form values from the browser.
  const modelName = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

  try {
    const bookJob = await prisma.bookJob.create({
      data: {
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileType: ext,
        modelName,
        status: "UPLOADED"
      }
    });

    await addBookJob(bookJob.id);
    logger.info("Job created and queued", { jobId: bookJob.id, file: req.file.originalname });

    sendJson(res, uploadResponseSchema, { jobId: bookJob.id, status: "UPLOADED" }, "upload response");
  } catch (err) {
    logger.error("Upload failed", { error: err.message });
    res.status(500).json({ error: "Failed to create job" });
  }
});

module.exports = router;
