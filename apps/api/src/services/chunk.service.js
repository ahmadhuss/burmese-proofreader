const DEFAULT_MAX_CHUNK_SIZE = 15000;
const DEFAULT_MIN_CHUNK_SIZE = 8000;
const SENTENCE_ENDING_REGEX = /[.!?\u104B\u201D"')\]]$/u;

// Reads a number from settings, but falls back to a safe default if it is missing.
function numberFromEnv(name, fallback) {
  const value = parseInt(process.env[name] || "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Makes text consistent before splitting, so books from different sources behave similarly.
function normalizeText(text) {
  return text
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Book heading styles can vary, so these patterns live in environment settings.
function configuredHeadingPatterns() {
  return (process.env.CHAPTER_HEADING_PATTERNS || "")
    .split(",")
    .map(pattern => pattern.trim())
    .filter(Boolean)
    .map(pattern => {
      try {
        return new RegExp(pattern, "iu");
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function hasNumber(text) {
  return /[\d\u1040-\u1049]/u.test(text);
}

function isConfiguredHeading(line, patterns) {
  return patterns.some(pattern => pattern.test(line));
}

function isLikelyHeading(lines, index, patterns) {
  const line = lines[index].trim();
  if (!line) return false;
  if (isConfiguredHeading(line, patterns)) return true;

  const prevBlank = index === 0 || lines[index - 1].trim() === "";
  const nextBlank = index === lines.length - 1 || lines[index + 1].trim() === "";
  const shortEnough = line.length <= numberFromEnv("MAX_HEADING_LENGTH", 80);

  // When no configured pattern matches, treat short isolated lines as possible headings.
  return shortEnough && prevBlank && nextBlank && (hasNumber(line) || !SENTENCE_ENDING_REGEX.test(line));
}

// First pass: preserve natural book sections when the text has visible headings.
function splitByHeadings(text) {
  const lines = normalizeText(text).split("\n");
  const patterns = configuredHeadingPatterns();
  const sections = [];
  let current = { title: null, lines: [] };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isLikelyHeading(lines, i, patterns)) {
      if (current.lines.some(existing => existing.trim())) {
        sections.push(current);
      }
      current = { title: line.trim(), lines: [line] };
    } else {
      current.lines.push(line);
    }
  }

  if (current.lines.some(line => line.trim())) sections.push(current);

  return sections.map(section => ({
    chapterTitle: section.title,
    text: section.lines.join("\n").trim()
  }));
}

// Final fallback for very long paragraphs: split by sentence boundaries when available.
function splitSentences(text) {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("my", { granularity: "sentence" });
    return [...segmenter.segment(text)].map(item => item.segment).filter(Boolean);
  }
  return text.split(/(?<=[.!?\u104B])\s+/u).filter(Boolean);
}

function pushSized(chunks, value) {
  const trimmed = value.trim();
  if (trimmed) chunks.push(trimmed);
}

function splitOversizedText(text, maxSize) {
  const sentences = splitSentences(text);
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxSize && current) {
      pushSized(chunks, current);
      current = sentence;
    } else {
      current = candidate;
    }
  }

  pushSized(chunks, current);
  return chunks.length ? chunks : [text.trim()];
}

function splitByParagraphs(text, maxSize, minSize) {
  const paragraphs = text.split(/\n{2,}/);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxSize) {
      pushSized(chunks, current);
      chunks.push(...splitOversizedText(paragraph, maxSize));
      current = "";
      continue;
    }

    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxSize && current.length >= minSize) {
      pushSized(chunks, current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  pushSized(chunks, current);
  return chunks;
}

// Public entry point: turn one whole book into ordered pieces the AI can safely process.
function buildChunks(text) {
  const maxSize = numberFromEnv("MAX_CHUNK_SIZE", DEFAULT_MAX_CHUNK_SIZE);
  const minSize = numberFromEnv("MIN_CHUNK_SIZE", DEFAULT_MIN_CHUNK_SIZE);
  const sections = splitByHeadings(text);
  const chunks = [];
  let index = 0;

  for (const section of sections) {
    const parts = section.text.length <= maxSize ? [section.text] : splitByParagraphs(section.text, maxSize, minSize);
    for (let i = 0; i < parts.length; i++) {
      chunks.push({
        chunkIndex: index++,
        chapterTitle: i === 0 ? section.chapterTitle : null,
        originalText: parts[i]
      });
    }
  }

  return chunks;
}

module.exports = { buildChunks };
