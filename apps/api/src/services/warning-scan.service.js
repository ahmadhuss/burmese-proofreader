const { callDeepSeekTool, objectSchema, toolDefinition } = require("./deepseek.service");
const { buildWarningScanPrompt } = require("prompts");
const logger = require("../utils/logger");

const EMPTY_RESULT = {
  political: { found: false, severity: "none", notes: [] },
  adultSexual: { found: false, severity: "none", notes: [] },
  bl: { found: false, severity: "none", notes: [] }
};

// One warning category has the same shape everywhere: found, severity, and notes.
const warningCategorySchema = objectSchema({
  found: { type: "boolean" },
  severity: { type: "string", enum: ["none", "low", "medium", "high"] },
  notes: { type: "array", items: { type: "string" } }
});

const WARNING_SCAN_TOOL = toolDefinition(
  "submit_warning_scan",
  "Submit content warning flags for the provided Burmese text.",
  objectSchema({
    political: warningCategorySchema,
    adultSexual: warningCategorySchema,
    bl: warningCategorySchema
  })
);

// Ask the model for warnings, but fall back to "no warnings" if the scan fails.
async function scanChunkForWarnings(text, model, opts = {}) {
  const prompt = buildWarningScanPrompt(text);
  try {
    return await callDeepSeekTool(prompt, WARNING_SCAN_TOOL, model, { ...opts, maxTokens: 2000 });
  } catch (err) {
    logger.warn("Warning scan failed, returning empty result", { error: err.message });
    return EMPTY_RESULT;
  }
}

// Combines all chunk-level warnings into one book-level warning summary.
function aggregateWarnings(results) {
  const SEVERITY_ORDER = ["none", "low", "medium", "high"];

  function maxSeverity(a, b) {
    return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
  }

  const summary = {
    political: { found: false, severity: "none", notes: [] },
    adultSexual: { found: false, severity: "none", notes: [] },
    bl: { found: false, severity: "none", notes: [] }
  };

  for (const r of results) {
    for (const key of ["political", "adultSexual", "bl"]) {
      if (r[key]?.found) {
        summary[key].found = true;
        summary[key].severity = maxSeverity(summary[key].severity, r[key].severity || "low");
        if (r[key].notes?.length) {
          summary[key].notes.push(...r[key].notes);
        }
      }
    }
  }

  return summary;
}

module.exports = { scanChunkForWarnings, aggregateWarnings };
