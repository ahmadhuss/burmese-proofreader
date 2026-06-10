function buildEditingPrompt(chunkText) {
  return `Correct the Burmese text below.

Rules:
1. Fix typo errors.
2. Correct Burmese spacing and formatting.
3. Preserve the original meaning.
4. Preserve all paragraphs in the same order.
5. Do not summarize or skip any paragraph.
6. Do not add new story content.
7. Submit the FULL corrected version of the provided text only.
8. Keep chapter headings if they are included in the text.

Use the required tool call to submit the result.

Text:
${chunkText}`;
}

function buildStrictEditingPrompt(chunkText) {
  return `STRICT correction task for Burmese text.

CRITICAL RULES:
1. Return the COMPLETE corrected text — do NOT skip or truncate any part.
2. Fix all typos, spacing, and formatting issues in Burmese.
3. Preserve EVERY paragraph in the EXACT same order.
4. Do NOT summarize, paraphrase, or skip paragraphs.
5. Do NOT add explanations or commentary.
6. Keep all chapter headings exactly as they appear.
7. Output length must be similar to input length.

Use the required tool call to submit the complete corrected text.

Text:
${chunkText}`;
}

function buildWarningScanPrompt(chunkText) {
  return `Analyze the Burmese text below for content warnings.

Check for:
1. Political content
2. Explicit 18+ sexual content
3. BL / boys love romantic or sexual content

Severity values: none, low, medium, high.
Use the required tool call to submit the scan result.

Text:
${chunkText}`;
}

module.exports = { buildEditingPrompt, buildStrictEditingPrompt, buildWarningScanPrompt };
