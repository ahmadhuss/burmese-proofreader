function publicApiBaseUrl() {
  const raw = process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 5557}`;
  return raw.replace(/\/+$/, "");
}

const API_BASE_URL = publicApiBaseUrl();

const openapiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Chatbot API Documentation",
    version: "1.0.0",
    description:
      "RAG-based Messenger chatbot API (see docs/rag-chatbot-plan.md). Onboards clients (Facebook Pages), " +
      "ingests their historical conversation history into a per-client knowledge base, and serves live " +
      "Messenger conversations by retrieving relevant knowledge and generating replies with DeepSeek.\n\n" +
      "Most of this API is either called by Meta (the /webhook routes) or is an internal/admin surface " +
      "(clients, ingestion) rather than something end users call directly. /api/test-chat is the one " +
      "exception, provided purely for local testing of the reply pipeline without a real Facebook Page."
  },
  servers: [{ url: API_BASE_URL, description: "Current chatbot API server" }],
  tags: [
    { name: "System", description: "Basic API status checks." },
    { name: "Clients", description: "Onboard and inspect clients (Facebook Pages) served by this chatbot." },
    { name: "Ingestion", description: "Load historical conversation data into a client's knowledge base." },
    { name: "Webhook", description: "Meta Messenger webhook endpoints — called by Facebook, not by you." },
    { name: "Testing", description: "Local-only test harness for the reply pipeline. Disabled in production unless ENABLE_TEST_ROUTES=true." }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Check if the API is running",
        responses: {
          200: {
            description: "The API server is running.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" }, examples: { ok: { value: { status: "ok" } } } } }
          }
        }
      }
    },
    "/api/clients": {
      post: {
        tags: ["Clients"],
        summary: "Onboard a new client (Facebook Page)",
        description: "Registers a Page's credentials and system prompt, and provisions its isolated KnowledgeChunk partition + HNSW index.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateClientRequest" } } }
        },
        responses: {
          201: {
            description: "Client created.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ClientSummary" },
                examples: { created: { value: { id: "cmrtndl6h0000hzvwpzk0yfqf", name: "Demo Store Test", facebookPageId: "1255698474288176" } } }
              }
            }
          },
          400: { $ref: "#/components/responses/BadRequest" }
        }
      }
    },
    "/api/clients/{id}": {
      get: {
        tags: ["Clients"],
        summary: "Get one client's public info",
        parameters: [{ $ref: "#/components/parameters/ClientId" }],
        responses: {
          200: {
            description: "Client found.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ClientDetail" } } }
          },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/ingestion/batches": {
      post: {
        tags: ["Ingestion"],
        summary: "Register a Meta export folder for ingestion",
        description: "For real .docx-export-style Meta data already sitting on the server's disk. For a Facebook Page's own conversation history, use POST /api/ingestion/pull-conversations instead.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateIngestionBatchRequest" } } }
        },
        responses: {
          201: {
            description: "Batch created and Stage 1 (parse) queued.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/IngestionBatchCreated" } } }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/ingestion/pull-conversations": {
      post: {
        tags: ["Ingestion"],
        summary: "Pull a Page's real Messenger history via the Graph API",
        description: "A Facebook Page's own conversation history has no manual export file the way a personal account does, so this pulls it directly via Meta's Graph API Conversations endpoint using the client's stored Page Access Token. Supports a date range via sinceDate/untilDate (messages outside the range are skipped), and can optionally be scoped to one Messenger user via psid (uses the Graph API's user_id filter) instead of pulling every conversation on the Page. Queues the pull, then the same segment -> curate -> embed pipeline, and returns immediately — poll GET /api/ingestion/batches/{id} for progress.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/PullConversationsRequest" } } }
        },
        responses: {
          201: {
            description: "Batch created and the Graph API pull queued.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/IngestionBatchCreated" } } }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    },
    "/api/ingestion/batches/{id}": {
      get: {
        tags: ["Ingestion"],
        summary: "Check an ingestion batch's progress",
        parameters: [{ $ref: "#/components/parameters/BatchId" }],
        responses: {
          200: {
            description: "Current batch status and row counts.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/IngestionBatchStatus" },
                examples: {
                  completed: {
                    value: {
                      id: "cmrtowxqs0001l4k2kt8fv194",
                      clientId: "cmrtndl6h0000hzvwpzk0yfqf",
                      filePath: "graph-api:1255698474288176",
                      status: "COMPLETED",
                      errorMessage: null,
                      _count: { rawMessages: 8, episodes: 1 }
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
    "/webhook": {
      get: {
        tags: ["Webhook"],
        summary: "Meta's webhook verification handshake",
        description: "Called once by Meta when you register the Callback URL. Not something you call yourself.",
        parameters: [
          { name: "hub.mode", in: "query", required: true, schema: { type: "string", example: "subscribe" } },
          { name: "hub.verify_token", in: "query", required: true, schema: { type: "string" } },
          { name: "hub.challenge", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: {
          200: { description: "Token matched — echoes back hub.challenge as plain text." },
          403: { description: "Token did not match MESSENGER_VERIFY_TOKEN." }
        }
      },
      post: {
        tags: ["Webhook"],
        summary: "Receives Messenger message events",
        description: "Called by Meta for every inbound message. Verifies the X-Hub-Signature-256 header against the client's appSecret, ACKs 200 immediately, and processes the message on a background queue.",
        responses: {
          200: { description: "Always returns 200 immediately, regardless of whether the event was valid — per Meta's webhook contract." }
        }
      }
    },
    "/api/test-chat": {
      post: {
        tags: ["Testing"],
        summary: "Run the reply pipeline without Messenger",
        description: "Runs the exact same retrieval + DeepSeek reply logic the live Messenger worker uses, and returns the result directly instead of sending it via the Send API. Local testing only — disabled in production unless ENABLE_TEST_ROUTES=true.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TestChatRequest" } } }
        },
        responses: {
          200: {
            description: "Reply generated.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/TestChatResponse" } } }
          },
          400: { $ref: "#/components/responses/BadRequest" },
          404: { $ref: "#/components/responses/NotFound" }
        }
      }
    }
  },
  components: {
    parameters: {
      ClientId: { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Client id returned by POST /api/clients." },
      BatchId: { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Batch id returned by POST /api/ingestion/batches." }
    },
    responses: {
      BadRequest: {
        description: "The request is missing something or has invalid data.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
      },
      NotFound: {
        description: "The requested resource was not found.",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } }
      }
    },
    schemas: {
      HealthResponse: {
        type: "object",
        required: ["status"],
        properties: { status: { type: "string", example: "ok" } }
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" } }
      },
      CreateClientRequest: {
        type: "object",
        required: ["name", "facebookPageId", "pageAccessToken", "appSecret", "systemPrompt"],
        properties: {
          name: { type: "string", example: "Demo Store Test" },
          facebookPageId: { type: "string", example: "1255698474288176" },
          pageAccessToken: { type: "string", description: "Page Access Token from Meta's Messenger API Settings." },
          appSecret: { type: "string", description: "App Secret from App Settings → Basic." },
          systemPrompt: { type: "string", example: "You are a friendly customer support assistant for Demo Store..." },
          embeddingModel: { type: "string", default: "intfloat/multilingual-e5-small" }
        }
      },
      ClientSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          facebookPageId: { type: "string" }
        }
      },
      ClientDetail: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          facebookPageId: { type: "string" },
          status: { type: "string", example: "ACTIVE" },
          embeddingModel: { type: "string" },
          createdAt: { type: "string", format: "date-time" }
        }
      },
      CreateIngestionBatchRequest: {
        type: "object",
        required: ["clientId", "filePath"],
        properties: {
          clientId: { type: "string" },
          filePath: { type: "string", description: "Path on the server to a directory of Meta export files (message_N.json per thread)." }
        }
      },
      IngestionBatchCreated: {
        type: "object",
        properties: { batchId: { type: "string" }, status: { type: "string", example: "UPLOADED" } }
      },
      PullConversationsRequest: {
        type: "object",
        required: ["clientId"],
        properties: {
          clientId: { type: "string" },
          sinceDate: { type: "string", format: "date", default: "2026-01-01", description: "Only pull messages on/after this date." },
          untilDate: { type: "string", format: "date", description: "Optional — only pull messages on/before this date. Omit to pull through to now." },
          psid: { type: "string", description: "Optional — pull only the one conversation thread with this Facebook user (Graph API user_id filter), instead of every conversation on the Page." }
        }
      },
      IngestionBatchStatus: {
        type: "object",
        properties: {
          id: { type: "string" },
          clientId: { type: "string" },
          filePath: { type: "string" },
          status: { type: "string", enum: ["UPLOADED", "PARSING", "SEGMENTING", "CURATING", "EMBEDDING", "COMPLETED", "FAILED"] },
          errorMessage: { type: "string", nullable: true },
          _count: {
            type: "object",
            properties: { rawMessages: { type: "integer" }, episodes: { type: "integer" } }
          }
        }
      },
      TestChatRequest: {
        type: "object",
        required: ["clientId", "psid", "text"],
        properties: {
          clientId: { type: "string" },
          psid: { type: "string", description: "Any string — identifies the simulated Messenger user for conversation history." },
          text: { type: "string", example: "What is your return policy?" }
        }
      },
      TestChatResponse: {
        type: "object",
        properties: {
          replyText: { type: "string" },
          confidence: { type: "number", example: 1 },
          escalate: { type: "boolean" },
          retrievedChunks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                question: { type: "string" },
                answer: { type: "string" },
                category: { type: "string", nullable: true },
                similarity: { type: "number" }
              }
            }
          },
          timings: {
            type: "object",
            properties: {
              retrievalMs: { type: "integer" },
              deepseekMs: { type: "integer" },
              totalMs: { type: "integer" }
            }
          }
        }
      }
    }
  }
};

module.exports = { openapiSpec };
