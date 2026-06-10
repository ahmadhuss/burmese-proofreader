const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

// Converts supported uploads into plain text before the AI editing begins.
async function extractText(filePath, fileType) {
  const ext = (fileType || path.extname(filePath)).toLowerCase().replace(".", "");

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (ext === "pdf") {
    const buffer = fs.readFileSync(filePath);
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (ext === "txt") {
    return fs.readFileSync(filePath, "utf8");
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

module.exports = { extractText };
