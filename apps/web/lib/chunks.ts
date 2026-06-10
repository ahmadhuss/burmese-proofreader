import { PreviewChunk } from "@/lib/api";

// Shows the body only. The heading is rendered separately so it does not appear twice.
export function chunkBodyText(chunk: PreviewChunk): string {
  const text = chunk.correctedText ?? "";
  const title = chunk.chapterTitle?.trim();
  if (!title) return text;

  const paragraphs = text.split(/\n{2,}/);
  if (paragraphs[0]?.trim() === title) {
    return paragraphs.slice(1).join("\n\n").trimStart();
  }

  return text;
}

// Used by copy buttons: put the heading back once, then the cleaned body.
export function chunkTextWithHeading(chunk: PreviewChunk): string {
  const heading = chunk.chapterTitle ? `${chunk.chapterTitle}\n\n` : "";
  return heading + chunkBodyText(chunk);
}
