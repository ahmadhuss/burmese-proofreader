const { z } = require("zod");
const { extendZodWithOpenApi } = require("@asteasolutions/zod-to-openapi");

extendZodWithOpenApi(z);

const jobIdSchema = z
  .string()
  .trim()
  .min(1, "jobId is required")
  .max(128, "jobId is too long")
  .regex(/^[A-Za-z0-9_-]+$/, "jobId contains invalid characters")
  .openapi({
    example: "clxbookjob123",
    param: {
      name: "jobId",
      in: "path",
      description: "Job ID returned after uploading a book."
    }
  });

const outputFilenameSchema = z.enum(["final.txt", "final.docx"]).openapi({
  example: "final.txt",
  param: {
    name: "filename",
    in: "path",
    description: "Generated output filename."
  }
});

const jobParamsSchema = z.object({
  jobId: jobIdSchema
});

const fileParamsSchema = z.object({
  jobId: jobIdSchema,
  filename: outputFilenameSchema
});

const uploadHeadersSchema = z
  .object({
    "x-docs-dry-run": z
      .enum(["true"])
      .optional()
      .openapi({
        example: "true",
        param: {
          name: "X-Docs-Dry-Run",
          in: "header",
          description: "When true, checks a playground upload without creating a real job or starting processing."
        }
      })
  })
  .passthrough();

module.exports = {
  fileParamsSchema,
  jobParamsSchema,
  uploadHeadersSchema
};
