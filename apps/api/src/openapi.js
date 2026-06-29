const { buildGeneratedComponents } = require("./openapi-components");

const API_BASE_URL = process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 5556}`;
const generatedComponents = buildGeneratedComponents();

const openapiSpec = {
  openapi: "3.1.0",
  info: {
    title: "API Documentation",
    version: "1.0.0",
    description:
      "Use this API to upload a book, watch its correction progress, preview finished text, and download the final files.\n\nQuick Start:\n1. Upload a .docx, .pdf, or .txt file with POST /api/upload.\n2. Copy the returned jobId. This ID is used to check the same book later.\n3. Check progress with GET /api/jobs/{jobId}.\n4. Preview corrected chunks with GET /api/jobs/{jobId}/preview while the job is still running.\n5. When the job status is COMPLETED or PARTIALLY_COMPLETED, call GET /api/jobs/{jobId}/result.\n6. Download final.txt or final.docx from the links returned by the result API.\n\nHow Processing Works:\n- Uploading only saves the file and creates a job.\n- The background worker does the real work: text extraction, splitting the book into smaller parts, AI correction, warning scan, and final file generation.\n- Some API calls may return 202 while the worker is still processing.\n\nSafe Playground Testing:\n- Requests sent from this documentation include X-Docs-Dry-Run: true.\n- That means upload tests in the playground validate the file only.\n- Playground uploads do not create a real job, do not enter the queue, and do not use AI tokens.\n- Real application requests do not send that header, so they create and queue real jobs."
  },
  servers: [
    {
      url: API_BASE_URL,
      description: "Current API server used by this documentation"
    }
  ],
  tags: [
    { name: "System", description: "Basic API status checks." },
    { name: "Uploads", description: "Send a book file to the API." },
    { name: "Jobs", description: "Check progress, previews, results, retries, and job history." },
    { name: "Files", description: "Download generated output files." }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Check if the API is running",
        responses: {
          200: {
            description: "The API server is running.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
                examples: {
                  ok: { value: { status: "ok" } }
                }
              }
            }
          }
        }
      }
    },
    "/api/upload": {
      post: {
        tags: ["Uploads"],
        summary: "Upload a book",
        description:
          "Upload a .docx, .pdf, or .txt book file. A real application request creates a job, saves the file, and adds the job to the queue. The upload request itself does not correct the book. Correction starts later when the background worker picks up the job.\n\nIn this docs playground, uploads are safe dry runs because the playground sends X-Docs-Dry-Run: true. The file is checked, but no real job is created, nothing is queued, and no AI tokens are used.",
        parameters: [{ $ref: "#/components/parameters/DocsDryRunHeader" }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description: "Book file to upload. Supported file types: .docx, .pdf, .txt."
                  }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "The upload was accepted. In playground mode, this is a dry-run response. In real app mode, this is a queued job response.",
            content: {
              "application/json": {
                schema: {
                  oneOf: [{ $ref: "#/components/schemas/UploadResponse" }, { $ref: "#/components/schemas/UploadDryRunResponse" }]
                },
                examples: {
                  docsDryRun: {
                    value: {
                      jobId: "docs-dry-run",
                      status: "DRY_RUN",
                      message: "Upload validated by API docs playground. No real job was created and no processing was queued."
                    }
                  },
                  queued: { value: { jobId: "clxbookjob123", status: "UPLOADED" } }
                }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          500: { $ref: "#/components/responses/InternalError" }
        }
      }
    },
    "/api/jobs": {
      get: {
        tags: ["Jobs"],
        summary: "List all jobs",
        responses: {
          200: {
            description: "Jobs ordered by creation date, newest first.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobsListResponse" },
                examples: {
                  jobs: {
                    value: {
                      jobs: [
                        {
                          id: "clxbookjob123",
                          fileName: "my-book.docx",
                          fileType: "docx",
                          status: "PROCESSING",
                          modelName: "deepseek-v4-flash",
                          totalChunks: 12,
                          completedChunks: 8,
                          failedChunks: 0,
                          warningSummary: null,
                          createdAt: "2026-06-29T18:10:00.000Z",
                          updatedAt: "2026-06-29T18:15:00.000Z"
                        }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      delete: {
        tags: ["Jobs"],
        summary: "Clear all jobs and files",
        description: "Deletes all job records, clears the queue, removes uploaded files, and removes generated output files. This action cannot be undone.",
        responses: {
          200: {
            description: "All stored jobs, queue items, uploads, and output files were cleared.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MessageResponse" },
                examples: {
                  cleared: { value: { message: "All data cleared" } }
                }
              }
            }
          },
          500: { $ref: "#/components/responses/InternalError" }
        }
      }
    },
    "/api/jobs/{jobId}": {
      get: {
        tags: ["Jobs"],
        summary: "Check one job",
        parameters: [{ $ref: "#/components/parameters/JobId" }],
        responses: {
          200: {
            description: "Current job status, progress numbers, and processing messages.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobStatus" },
                examples: {
                  processing: {
                    value: {
                      id: "clxbookjob123",
                      status: "PROCESSING",
                      fileName: "my-book.docx",
                      modelName: "deepseek-v4-flash",
                      totalChunks: 12,
                      completedChunks: 8,
                      failedChunks: 0,
                      progressPercent: 67,
                      errorMessage: null,
                      processingLog: [
                        {
                          ts: "2026-06-29T18:15:30.000Z",
                          msg: "Split into 12 chunks",
                          level: "info"
                        }
                      ]
                    }
                  }
                }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/jobs/{jobId}/preview": {
      get: {
        tags: ["Jobs"],
        summary: "Preview corrected text",
        description: "Returns corrected chunks that are already finished. Use this while the job is still running to show live progress to the user.",
        parameters: [{ $ref: "#/components/parameters/JobId" }],
        responses: {
          200: {
            description: "Completed corrected chunks, ordered from first to last.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobPreview" },
                examples: {
                  preview: {
                    value: {
                      status: "PROCESSING",
                      totalChunks: 12,
                      completedChunks: 1,
                      chunks: [
                        {
                          chunkIndex: 0,
                          chapterTitle: "Chapter 1",
                          correctedText: "Corrected Burmese text..."
                        }
                      ]
                    }
                  }
                }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/jobs/{jobId}/result": {
      get: {
        tags: ["Jobs"],
        summary: "Get final download links",
        parameters: [{ $ref: "#/components/parameters/JobId" }],
        responses: {
          200: {
            description: "The final files are ready to download.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/JobResult" },
                examples: {
                  completed: {
                    value: {
                      status: "COMPLETED",
                      outputTxtUrl: "/api/files/clxbookjob123/final.txt",
                      outputDocxUrl: "/api/files/clxbookjob123/final.docx",
                      warningSummary: {
                        political: { found: false, severity: "none", notes: [] },
                        adultSexual: { found: false, severity: "none", notes: [] },
                        bl: { found: false, severity: "none", notes: [] }
                      }
                    }
                  }
                }
              }
            }
          },
          202: {
            description: "The job is still running, so final files are not ready yet.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PendingResult" },
                examples: {
                  processing: {
                    value: {
                      status: "PROCESSING",
                      message: "Job not yet complete"
                    }
                  }
                }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/jobs/{jobId}/retry": {
      post: {
        tags: ["Jobs"],
        summary: "Retry failed chunks",
        description: "Use this when a job finished as PARTIALLY_COMPLETED. Failed chunks are set back to pending, and the job is placed in the queue again.",
        parameters: [{ $ref: "#/components/parameters/JobId" }],
        responses: {
          200: {
            description: "Retry was started for the failed chunks.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RetryResponse" },
                examples: {
                  retryStarted: {
                    value: {
                      message: "Retry started",
                      jobId: "clxbookjob123"
                    }
                  }
                }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/files/{jobId}/final.txt": {
      get: {
        tags: ["Files"],
        summary: "Download final.txt",
        parameters: [{ $ref: "#/components/parameters/JobId" }],
        responses: {
          200: {
            description: "Corrected plain text file.",
            content: {
              "text/plain": {
                schema: {
                  type: "string",
                  format: "binary"
                }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/files/{jobId}/final.docx": {
      get: {
        tags: ["Files"],
        summary: "Download final.docx",
        parameters: [{ $ref: "#/components/parameters/JobId" }],
        responses: {
          200: {
            description: "Corrected Word document.",
            content: {
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
                schema: {
                  type: "string",
                  format: "binary"
                }
              }
            }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    }
  },
  components: {
    parameters: generatedComponents.parameters || {},
    responses: {
      BadRequest: {
        description: "The request is missing something or has invalid data.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            examples: {
              invalidRequest: { value: { error: "No file uploaded" } }
            }
          }
        }
      },
      NotFound: {
        description: "The requested job or file was not found.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            examples: {
              notFound: { value: { error: "Job not found" } }
            }
          }
        }
      },
      InternalError: {
        description: "The API hit an unexpected server error.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
            examples: {
              serverError: { value: { error: "Internal server error" } }
            }
          }
        }
      }
    },
    schemas: {
      HealthResponse: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", example: "ok" }
        }
      },
      ...(generatedComponents.schemas || {})
    }
  }
};

module.exports = { openapiSpec };
