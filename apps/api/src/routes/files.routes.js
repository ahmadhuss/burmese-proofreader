const express = require("express");
const path = require("path");
const fs = require("fs");
const { resolveOutputDir } = require("../utils/file");

const router = express.Router();

router.get("/:jobId/:filename", (req, res) => {
  const { jobId, filename } = req.params;

  const safeJobId = path.basename(jobId);
  const safeFilename = path.basename(filename);
  const filePath = path.join(resolveOutputDir(), safeJobId, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.download(filePath, safeFilename);
});

module.exports = router;
