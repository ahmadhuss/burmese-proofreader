const fs = require("fs");
const path = require("path");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolveUploadDir() {
  const rel = process.env.UPLOAD_DIR || "uploads";
  return path.isAbsolute(rel) ? rel : path.resolve(process.cwd(), "../..", rel);
}

function resolveOutputDir() {
  const rel = process.env.OUTPUT_DIR || "outputs";
  return path.isAbsolute(rel) ? rel : path.resolve(process.cwd(), "../..", rel);
}

function jobOutputDir(jobId) {
  const dir = path.join(resolveOutputDir(), jobId);
  ensureDir(dir);
  return dir;
}

module.exports = { ensureDir, resolveUploadDir, resolveOutputDir, jobOutputDir };
