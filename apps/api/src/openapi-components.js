const { z } = require("zod");
const { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } = require("@asteasolutions/zod-to-openapi");

extendZodWithOpenApi(z);

const {
  fileParamsSchema,
  jobParamsSchema,
  uploadHeadersSchema
} = require("./validation/schemas");
const {
  errorResponseSchema,
  jobPreviewSchema,
  jobResultSchema,
  jobStatusSchema,
  jobStatusValueSchema,
  jobsListResponseSchema,
  jobSummarySchema,
  logEntrySchema,
  messageResponseSchema,
  pendingResultSchema,
  previewChunkSchema,
  retryResponseSchema,
  uploadDryRunResponseSchema,
  uploadResponseSchema,
  warningCategorySchema,
  warningSummarySchema
} = require("./validation/response-schemas");

function buildGeneratedComponents() {
  const registry = new OpenAPIRegistry();

  registry.registerParameter("JobId", jobParamsSchema.shape.jobId);
  registry.registerParameter("OutputFilename", fileParamsSchema.shape.filename);
  registry.registerParameter("DocsDryRunHeader", uploadHeadersSchema.shape["x-docs-dry-run"]);

  registry.register("ErrorResponse", errorResponseSchema);
  registry.register("JobPreview", jobPreviewSchema);
  registry.register("JobResult", jobResultSchema);
  registry.register("JobStatus", jobStatusSchema);
  registry.register("JobStatusValue", jobStatusValueSchema);
  registry.register("JobsListResponse", jobsListResponseSchema);
  registry.register("JobSummary", jobSummarySchema);
  registry.register("LogEntry", logEntrySchema);
  registry.register("MessageResponse", messageResponseSchema);
  registry.register("PendingResult", pendingResultSchema);
  registry.register("PreviewChunk", previewChunkSchema);
  registry.register("RetryResponse", retryResponseSchema);
  registry.register("UploadDryRunResponse", uploadDryRunResponseSchema);
  registry.register("UploadResponse", uploadResponseSchema);
  registry.register("WarningCategory", warningCategorySchema);
  registry.register("WarningSummary", warningSummarySchema);

  const generator = new OpenApiGeneratorV31(registry.definitions, {
    unionPreferredType: "oneOf",
    sortComponents: "alphabetically"
  });

  return generator.generateComponents().components || {};
}

module.exports = { buildGeneratedComponents };
