# RAG Messenger Chatbot (`apps/chatbot`) — Build Plan

## Direction change

The original ask was to self-host DeepSeek on a GPU server (Hetzner) and share it between the book editor and a new RAG chatbot. Decision: **don't self-host DeepSeek.** Instead, reuse the same **hosted DeepSeek API** the book editor already calls (`api.deepseek.com`), just for a new app. This removes all GPU/Hetzner-sizing concerns — the chatbot stack runs on an ordinary CPU server. The self-hosted piece that's still worth doing (to avoid Pinecone) is the vector store: Postgres + pgvector.

Decisions locked in:
- New app **inside this monorepo**: `apps/chatbot`, following the same conventions as `apps/api` (Express + BullMQ worker + PM2).
- Vector store: **Postgres + pgvector**, a new instance — the book editor's SQLite DB is untouched.
- Source data: **raw JSON conversation exports from Meta**, not already in a queryable DB — ingestion starts from parsing these files.
- Messenger webhook integration: **fresh build**, no existing code to reuse.
- Multi-tenant: this serves multiple clients (each their own Facebook Page) — retrieval must never cross client boundaries.

## Context

This repo ("Burmese Proof Reader") is the "book editing system." It's a Next.js/Express/BullMQ app that chunks uploaded books and sends each chunk to DeepSeek for correction via an **OpenAI-compatible SDK** (`apps/api/src/services/deepseek.service.js`), pointed at DeepSeek's hosted API. There is no RAG, chatbot, embeddings, or vector-DB code anywhere in this repo yet — this is all net-new.

---

## 1. Data model (Postgres + pgvector)

New Prisma schema at `apps/chatbot/prisma/schema.prisma`, own datasource (`CHATBOT_DATABASE_URL`), separate Postgres instance.

Prisma has no first-class `vector` type — declare it `Unsupported("vector(384)")` and do all vector-column reads/writes (ANN search, embedding inserts) via raw SQL (`$queryRaw`/`$executeRawUnsafe`), wrapped in one module, `apps/chatbot/src/db/vector.js`. The HNSW index and partitioning below aren't expressible in Prisma's schema DSL either — generate the migration with `prisma migrate dev --create-only`, then hand-edit the SQL before applying.

**Long-term knowledge base:**
- `Client` — `id`, `name`, `facebookPageId` (unique), `pageAccessToken` (encrypted at rest), `appSecret`, `systemPrompt`, `embeddingModel`, `status`. This is the tenant boundary everything else scopes to.
- `KnowledgeChunk` — `id`, `clientId` (FK), `question`, `answer`, `category`, `language`, `sourceEpisodeId` (nullable, traceability), `extractionVersion`, `status` (`PENDING_EMBED | READY | DUPLICATE`), `duplicateOfId` (self-FK), `embedding: Unsupported("vector(384)")`.
  - **Tenant isolation + ANN performance at "millions" scale**: LIST-partition `knowledge_chunk` BY `client_id`, with a dedicated HNSW index per partition (created when a `Client` is provisioned, via `apps/chatbot/src/db/partitions.js:createClientPartition(clientId)`). This makes isolation a storage-layer guarantee, not just a `WHERE` clause, and keeps each ANN index small.
- Ingestion staging: `IngestionBatch`, `RawMessage`, `ConversationEpisode` (see §2).

**Live/short-term Messenger state:**
- `ConversationSession` — `id`, `clientId`, `psid`, `lastMessageAt`, `status` (`ACTIVE | ESCALATED | CLOSED`), unique `(clientId, psid)`.
- `ConversationMessage` — `id`, `sessionId` (FK), `role` (`user | assistant`), `content`, `retrievedChunkIds` (JSON, audit trail), `mid` (Meta's message id — redelivery-safe idempotency), `createdAt`.

---

## 2. Ingestion pipeline

**Recommendation: LLM-based curation, not direct embedding of raw chat logs.** Raw threads are dominated by greetings, "ok/thanks", human handoffs, typos, and PII — embedding every raw turn gives poor retrieval precision and bloats the index. Instead, run each conversation through DeepSeek once to extract clean Q&A/FAQ-style `KnowledgeChunk` rows (canonical question + answer + category).

**Data gotcha:** Meta's Messenger JSON export has a known bug — non-ASCII text (including Burmese) is stored as UTF-8 bytes mis-decoded as Latin-1. Every text field must be re-decoded (`Buffer.from(str, "latin1").toString("utf8")`) at parse time, or Burmese content comes out garbled.

**Stages** (mirrors the existing `book.queue.js` / `book.worker.js` split — one BullMQ queue per stage so bulk ingestion never competes with live chat traffic):
- **Stage 0 — Intake**: admin upload route + a CLI backfill entrypoint (`apps/chatbot/src/cli/backfill.js`, multi-GB exports aren't practical over HTTP). Creates `IngestionBatch`.
- **Stage 1 — Parse**: stream Meta's `message_N.json` per thread with a streaming JSON parser (bounded memory), apply the latin1→utf8 fix, upsert `RawMessage` keyed by thread id + timestamp + sender (safe to rerun).
- **Stage 2 — Segmentation**: group `RawMessage` rows into `ConversationEpisode`s by idle-time gap (e.g. >4h = new episode).
- **Stage 3 — Curation**: send each episode to DeepSeek via a strict tool call (`submit_knowledge_chunks` → array of `{question, answer, category, confidence}`), write `KnowledgeChunk` rows as `PENDING_EMBED`. Unique on `(episodeId, extractionVersion)` — bump the version to force re-curation after a prompt change without duplicating.
- **Stage 4 — Embed + dedup**: batch 64–128 chunks per embedding call; after embedding, mark near-duplicates (cosine similarity > ~0.97 within the same client+category) as `DUPLICATE` instead of inserting redundant vectors.

Every table uses durable natural-ID upserts and status enums; BullMQ job IDs are deterministic (`${batchId}:${stage}:${entityId}`) for free dedup on reruns. A periodic reconciliation job requeues anything stuck non-terminal after a crash.

---

## 3. Embedding

DeepSeek has no embeddings endpoint, so this needs a separate model/service.

- **Model**: `intfloat/multilingual-e5-small` (384-dim, ~118M params) for the pilot — solid multilingual/Burmese coverage, cheap on CPU. If Burmese retrieval quality proves insufficient, step up to `multilingual-e5-base` or BGE-M3 later.
- **Serving**: a small Python **FastAPI microservice** (`apps/embedding-svc`, own PM2 process) using `sentence-transformers` with ONNX/int8 quantization — one `POST /embed`. Python's quantization/batching tooling is more mature here than Node's `transformers.js`, which is worth using only if avoiding a second runtime matters more than throughput for the pilot.
- Node side: `apps/chatbot/src/services/embedding.service.js` wraps the HTTP call with the existing `withRetry` pattern from `apps/api/src/utils/retry.js`.

---

## 4. RAG query flow (webhook → reply)

1. `webhook.routes.js`: `GET` handles Meta's verify-token challenge; `POST` resolves `clientId` from the Page ID, validates `X-Hub-Signature-256` with that client's `appSecret`, **ACKs 200 immediately**, enqueues to `chatbot-message` with `jobId = mid` (dedups webhook redelivery).
2. `message.worker.js` processes the job: look up/create `ConversationSession`; load recent `ConversationMessage` history; embed the incoming text; run pgvector similarity search scoped to that client's partition (top-k ~5); build the prompt (client's `systemPrompt` + retrieved chunks + short-term history + new message); call DeepSeek via a strict tool schema (`submit_reply` → `{reply_text, confidence, escalate_to_human}`); on low confidence/error, fall back (see §7); send the reply via the Messenger Send API using that client's Page token; persist both turns (including `retrievedChunkIds` for later quality audits) with per-stage latency logging correlated by `clientId`/`psid`/`mid`.

---

## 5. Code reuse from `deepseek.service.js`

Generic (worth extracting): `resolveBaseUrl()`, the `OpenAI` client construction, `objectSchema()`, `toolDefinition()`, `callDeepSeekTool()`.
Book-specific (stays in `apps/api`): `SUSPICIOUS_PHRASES`, `validateOutput()`, `CORRECT_TEXT_TOOL`, `correctChunk()`.

**Extract `packages/deepseek-client`** (same shape as the existing `packages/prompts`), minimal interface: `createDeepSeekClient({ apiKey, baseUrl })` (factory, not singleton — lets `apps/chatbot` use its own key/env independent of `apps/api`), `callTool(client, { prompt, systemPrompt, tool, model, maxTokens, thinkingEnabled, reasoningEffort })`, `objectSchema`, `toolDefinition`. `apps/api/src/services/deepseek.service.js` becomes a thin wrapper on top, same pattern it already uses for `packages/prompts`.

---

## 6. Infra additions

- **`docker-compose.yml`**: add a `postgres` service (`pgvector/pgvector:pg16` image), container `chatbot-postgres`, named volume, mapped to `5433:5432` to avoid clashing with any local Postgres. Existing `redis` service is reused for BullMQ — chatbot queues get distinct names (`chatbot-message`, `chatbot-ingest-*`) so there's no collision with the book editor's queue.
- **`ecosystem.config.js`**: add `chatbot-api` (`apps/chatbot`, e.g. port `5557`), `chatbot-worker` (live chat), `chatbot-ingest-worker` (bulk backfill, kept separate so it never delays live replies), `chatbot-embed` (`apps/embedding-svc`, PM2 `interpreter: "python3"`, e.g. port `5558`).
- **Root `package.json`**: add `dev:chatbot`, `dev:chatbot-worker`, `dev:chatbot-ingest-worker`, `dev:embed`, `ingest:backfill`, namespaced Prisma scripts (`prisma:studio:chatbot`, `prisma:migrate:chatbot`).

---

## 7. Phasing

**Pilot (single client)** — build the full vertical slice at small scale: `apps/chatbot` skeleton, Prisma schema/migrations (incl. hand-edited HNSW/partition SQL), embedding microservice, ingestion stages 0–4 against one real client's export (a representative subset first), webhook + DeepSeek + Send API wired end to end against one test Facebook Page.
*Done* when: (a) message → retrieval → DeepSeek → Messenger reply works reliably; (b) retrieval manually spot-checked against ~30–50 labeled test questions; (c) a negative isolation test proves a second dummy client's chunks are never retrieved by the pilot client's queries; (d) re-running the same ingestion batch doesn't duplicate chunks; (e) PM2 processes run in a production-like config; (f) per-stage latency logging exists with a defined reply-latency budget.

**Scale-out** — onboard remaining clients (admin flow for `Client` + Page token + partition provisioning), run full historical backfill via the CLI at real volume with reconciliation proven under crash/restart, tune BullMQ concurrency and embedding batch sizes against measured throughput, add per-client config (tone, escalation rules, business hours).

**Hardening** — queue-depth/error-rate alerting, embedding-service health checks, per-client and per-psid rate limiting, a circuit-breaker fallback reply when DeepSeek or Postgres is slow/down (static reply + human-escalation flag, rather than blocking), Postgres backups, secrets management for multiple Page access tokens, data retention/PII policy for stored conversation exports.

---

## Critical files

- `apps/api/src/services/deepseek.service.js` — source for extracting `packages/deepseek-client`'s generic plumbing
- `apps/api/src/queues/book.queue.js`, `apps/api/src/queues/book.worker.js` — reference pattern for `apps/chatbot`'s `message.worker.js` / `ingest.worker.js`
- `apps/api/src/db/prisma.js` — pattern for the new Prisma client singleton in `apps/chatbot`
- `apps/api/src/utils/retry.js`, `apps/api/src/utils/logger.js` — reuse directly or mirror
- `apps/api/prisma/schema.prisma` — reference for the new `apps/chatbot/prisma/schema.prisma`
- `ecosystem.config.js`, `docker-compose.yml`, `package.json` (root) — extend per §6
- `packages/prompts/package.json` — pattern to follow for the new `packages/deepseek-client`

---

## Verification (once built)

- `pnpm --filter chatbot dev` boots the webhook server against a local ngrok tunnel registered as a Meta test app's webhook URL; send a real test message from a Messenger test user and confirm a reply round-trips.
- Run the CLI backfill against a small sample export, confirm `KnowledgeChunk` rows populate and `prisma studio` (chatbot DB) shows expected data with no duplicate rows on a second run.
- Run the negative isolation test (§7) before onboarding a second real client.

---

## Server hosting note (Hetzner)

DeepSeek stays hosted (`api.deepseek.com`) — no GPU server needed. The chatbot stack (`apps/chatbot`, `apps/embedding-svc`, Postgres+pgvector) can run on a plain CPU box. A reasonable pilot spec: 4-8 vCPU, 16-32GB RAM, 200GB+ NVMe (Postgres + conversation export storage grows with ingestion volume) — a Hetzner Cloud CPX41/CPX51 class instance or a small dedicated line server. Scale RAM/CPU up once real ingestion and concurrent-chat load are measured.
