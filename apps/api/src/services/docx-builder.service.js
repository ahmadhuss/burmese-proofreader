const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require("docx");
const fs = require("fs");

// The heading is stored separately, so remove it if the corrected text repeats it.
function chunkBodyText(chunk) {
  const text = chunk.correctedText || chunk.originalText || "";
  const title = chunk.chapterTitle?.trim();
  if (!title) return text;

  const paragraphs = text.split(/\n{2,}/);
  if (paragraphs[0]?.trim() === title) {
    return paragraphs.slice(1).join("\n\n").trimStart();
  }

  return text;
}

// Builds a readable Word document from the finished chunk list.
function buildDocx(chunks) {
  const children = [];

  for (const chunk of chunks) {
    if (chunk.chapterTitle) {
      children.push(
        new Paragraph({
          text: chunk.chapterTitle,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 }
        })
      );
    }

    const paragraphs = chunkBodyText(chunk).split(/\n{2,}/);
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      if (trimmed === chunk.chapterTitle) continue;

      children.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed, size: 24 })],
          spacing: { before: 100, after: 100 },
          alignment: AlignmentType.LEFT
        })
      );
    }
  }

  return new Document({ sections: [{ children }] });
}

async function generateDocx(chunks, outputPath) {
  const doc = buildDocx(chunks);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

// Plain text output mirrors the Word document, but without styling.
async function generateTxt(chunks, outputPath) {
  const parts = chunks.map(c => {
    const heading = c.chapterTitle ? `${c.chapterTitle}\n\n` : "";
    return heading + chunkBodyText(c);
  });
  await fs.promises.writeFile(outputPath, parts.join("\n\n"), "utf8");
}

module.exports = { generateDocx, generateTxt };
