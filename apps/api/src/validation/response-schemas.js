const { z } = require("zod");
const { extendZodWithOpenApi } = require("@asteasolutions/zod-to-openapi");

extendZodWithOpenApi(z);

const jobStatusValueSchema = z.enum([
  "UPLOADED",
  "EXTRACTING",
  "SPLITTING",
  "PROCESSING",
  "GENERATING_OUTPUT",
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "FAILED"
]).openapi({
  description: "Current state of the book job.",
  example: "PROCESSING"
});

const errorResponseSchema = z.object({
  error: z.string().openapi({
    description: "Human-readable error message.",
    example: "Job not found"
  })
}).openapi({
  description: "Error response returned when the request cannot be completed."
});

const messageResponseSchema = z.object({
  message: z.string().openapi({
    description: "Human-readable success message.",
    example: "All data cleared"
  })
}).openapi({
  description: "Simple success message."
});

const uploadResponseSchema = z.object({
  jobId: z.string().openapi({
    description: "ID for the uploaded book job. Use it to check progress and download results.",
    example: "clxbookjob123"
  }),
  status: z.literal("UPLOADED").openapi({
    description: "The file was uploaded and the job was created.",
    example: "UPLOADED"
  })
}).openapi({
  description: "Response for a real upload request."
});

const uploadDryRunResponseSchema = z.object({
  jobId: z.literal("docs-dry-run").openapi({
    description: "Fake job ID used only for safe docs playground testing.",
    example: "docs-dry-run"
  }),
  status: z.literal("DRY_RUN").openapi({
    description: "The upload was tested only. No real job was created.",
    example: "DRY_RUN"
  }),
  message: z.string().openapi({
    description: "Plain explanation of what happened.",
    example: "Upload validated by API docs playground. No real job was created and no processing was queued."
  })
}).openapi({
  description: "Response for a safe playground upload test."
});

const retryResponseSchema = z.object({
  message: z.string().openapi({
    description: "Retry result message.",
    example: "Retry started"
  }),
  jobId: z.string().openapi({
    description: "Job ID that was retried.",
    example: "clxbookjob123"
  })
}).openapi({
  description: "Response after retrying failed chunks."
});

const pendingResultSchema = z.object({
  status: jobStatusValueSchema,
  message: z.string().openapi({
    description: "Explains that the final files are not ready yet.",
    example: "Job not yet complete"
  })
}).openapi({
  description: "Response returned while the job is still running."
});

const logEntrySchema = z.object({
  ts: z.string().openapi({
    description: "Time when this log message was created.",
    example: "2026-06-29T18:15:30.000Z"
  }),
  msg: z.string().openapi({
    description: "What happened during processing.",
    example: "Split into 12 chunks"
  }),
  level: z.enum(["info", "warn", "error"]).openapi({
    description: "Message level: normal info, warning, or error.",
    example: "info"
  })
}).openapi({
  description: "One log message from the processing job."
});

const warningCategorySchema = z.object({
  found: z.boolean().openapi({
    description: "Whether this kind of content was found.",
    example: false
  }),
  severity: z.enum(["none", "low", "medium", "high"]).openapi({
    description: "How strong the warning is.",
    example: "none"
  }),
  notes: z.array(z.string()).openapi({
    description: "Short notes explaining the warning.",
    example: []
  })
}).openapi({
  description: "Warning result for one content category."
});

const warningSummarySchema = z.object({
  political: warningCategorySchema,
  adultSexual: warningCategorySchema,
  bl: warningCategorySchema
}).openapi({
  description: "All content warnings found in the corrected book."
});

const jobSummarySchema = z.object({
  id: z.string().openapi({
    description: "Job ID.",
    example: "clxbookjob123"
  }),
  fileName: z.string().openapi({
    description: "Name of the uploaded file.",
    example: "my-book.docx"
  }),
  fileType: z.string().nullable().openapi({
    description: "Uploaded file type.",
    example: "docx"
  }),
  status: jobStatusValueSchema,
  modelName: z.string().openapi({
    description: "AI model used by the server for this job.",
    example: "deepseek-v4-flash"
  }),
  totalChunks: z.number().int().openapi({
    description: "Total number of text chunks in the job.",
    example: 12
  }),
  completedChunks: z.number().int().openapi({
    description: "Number of chunks already corrected.",
    example: 8
  }),
  failedChunks: z.number().int().openapi({
    description: "Number of chunks that failed.",
    example: 0
  }),
  warningSummary: warningSummarySchema.nullable().openapi({
    description: "Warning summary, available after processing finishes.",
    example: null
  }),
  createdAt: z.coerce.date().openapi({
    description: "When the job was created.",
    example: "2026-06-29T18:10:00.000Z"
  }),
  updatedAt: z.coerce.date().openapi({
    description: "When the job was last updated.",
    example: "2026-06-29T18:15:00.000Z"
  })
}).openapi({
  description: "Short job record used in the sessions list."
});

const jobsListResponseSchema = z.object({
  jobs: z.array(jobSummarySchema).openapi({
    description: "Jobs ordered newest first."
  })
}).openapi({
  description: "List of book jobs."
});

const jobStatusSchema = z.object({
  id: z.string().openapi({
    description: "Job ID.",
    example: "clxbookjob123"
  }),
  status: jobStatusValueSchema,
  fileName: z.string().openapi({
    description: "Name of the uploaded file.",
    example: "my-book.docx"
  }),
  modelName: z.string().openapi({
    description: "AI model used by the server for this job.",
    example: "deepseek-v4-flash"
  }),
  totalChunks: z.number().int().openapi({
    description: "Total number of text chunks in the job.",
    example: 12
  }),
  completedChunks: z.number().int().openapi({
    description: "Number of chunks already corrected.",
    example: 8
  }),
  failedChunks: z.number().int().openapi({
    description: "Number of chunks that failed.",
    example: 0
  }),
  progressPercent: z.number().int().min(0).max(100).openapi({
    description: "Progress from 0 to 100.",
    example: 67
  }),
  errorMessage: z.string().nullable().openapi({
    description: "Error message if the job failed.",
    example: null
  }),
  processingLog: z.array(logEntrySchema).openapi({
    description: "Messages that explain what the worker has done so far."
  })
}).openapi({
  description: "Detailed status for one job."
});

const previewChunkSchema = z.object({
  chunkIndex: z.number().int().openapi({
    description: "Chunk number, starting from 0.",
    example: 0
  }),
  chapterTitle: z.string().nullable().openapi({
    description: "Chapter title if one was found.",
    example: "Chapter 1"
  }),
  correctedText: z.string().nullable().openapi({
    description: "Corrected text for this chunk.",
    example: "Corrected Burmese text..."
  })
}).openapi({
  description: "One corrected text chunk."
});

const jobPreviewSchema = z.object({
  status: jobStatusValueSchema,
  totalChunks: z.number().int().openapi({
    description: "Total number of text chunks in the job.",
    example: 12
  }),
  completedChunks: z.number().int().openapi({
    description: "Number of chunks already corrected.",
    example: 8
  }),
  chunks: z.array(previewChunkSchema).openapi({
    description: "Corrected chunks, ordered from first to last."
  })
}).openapi({
  description: "Preview text that is ready so far."
});

const jobResultSchema = z.object({
  status: z.enum(["COMPLETED", "PARTIALLY_COMPLETED"]).openapi({
    description: "Final job status after output files are created.",
    example: "COMPLETED"
  }),
  outputTxtUrl: z.string().openapi({
    description: "Download link for the corrected .txt file.",
    example: "/api/files/clxbookjob123/final.txt"
  }),
  outputDocxUrl: z.string().openapi({
    description: "Download link for the corrected .docx file.",
    example: "/api/files/clxbookjob123/final.docx"
  }),
  warningSummary: warningSummarySchema
}).openapi({
  description: "Final download links and warning summary."
});

module.exports = {
  errorResponseSchema,
  jobPreviewSchema,
  jobResultSchema,
  jobsListResponseSchema,
  jobStatusSchema,
  jobStatusValueSchema,
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
};
