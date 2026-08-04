# Burmese Proof Reader

This repository contains two related products that share the same DeepSeek AI account.

1. Book Editor, a web app that corrects Burmese books using AI. Full details in [docs/book-editor.md](docs/book-editor.md).
2. RAG Messenger Chatbot, a Facebook Messenger chatbot that answers customers using each client's own past conversation history. Full details in [docs/chatbot.md](docs/chatbot.md).

Both live inside one pnpm workspace so they can share code and run on one server.

This page is a short overview and a quick start guide. For every environment variable, every API endpoint, and a full step by step explanation of how each app works internally, open the two documents linked above.

---

## Table Of Contents

* [What This Project Does](#what-this-project-does)
* [Full Documentation](#full-documentation)
* [Project Layout](#project-layout)
* [Requirements](#requirements)
* [Quick Start](#quick-start)
* [Environment Files, Quick Reference](#environment-files-quick-reference)
* [Production Deployment With PM2](#production-deployment-with-pm2)
* [Updating Production](#updating-production)
* [Reverse Proxy](#reverse-proxy)
* [Backup Checklist](#backup-checklist)
* [Useful Commands](#useful-commands)
* [Troubleshooting](#troubleshooting)

---

## What This Project Does

### Book Editor

A user uploads a `.docx`, `.pdf`, or `.txt` book. The server reads the text, splits it into safe pieces, sends each piece to DeepSeek for correction, checks for sensitive content, and produces downloadable `.txt` and `.docx` files.

### RAG Messenger Chatbot

Instead of a rigid, menu based Facebook bot, this chatbot reads a real question, searches a company's own historical Messenger conversations for the closest matching answers, and asks DeepSeek to write a natural reply using that context. This approach is called RAG, short for Retrieval Augmented Generation. In simple words, look up the real answer first, then let the AI write it in a natural sentence.

Each Facebook Page is treated as one Client in the system, and one Client's knowledge is never mixed with another Client's knowledge.

---

## Full Documentation

| Document | Covers |
| --- | --- |
| [docs/book-editor.md](docs/book-editor.md) | Every environment variable, every API endpoint with copyable commands, how splitting and warning scanning work, and full troubleshooting for the Book Editor. |
| [docs/chatbot.md](docs/chatbot.md) | Every environment variable, every API endpoint with copyable commands, the full learning and answering pipelines explained simply, connecting a real Facebook Page, loading historical conversations, and full troubleshooting for the Chatbot. |
| [docs/rag-chatbot-plan.md](docs/rag-chatbot-plan.md) | The original design notes written before the Chatbot was built. |

---

## Project Layout

```txt
acra/
  apps/
    api/             Book Editor backend, Express, Prisma, BullMQ worker
    web/              Book Editor frontend, Next.js
    chatbot/          Chatbot backend, Express, Prisma, BullMQ worker
    embedding-svc/    Small Python service that turns text into search vectors
  packages/
    prompts/          Shared DeepSeek prompt text for the Book Editor
    deepseek-client/  Shared DeepSeek connection code used by both apps
  docs/
    book-editor.md         Full Book Editor documentation
    chatbot.md              Full Chatbot documentation
    rag-chatbot-plan.md    The original design notes for the chatbot
  uploads/            Uploaded book files
  outputs/            Generated corrected book files
```

---

## Requirements

Install these once on your development machine or server:

* [Node.js](https://nodejs.org/) 18 or newer
* [pnpm](https://pnpm.io/installation) 9 or newer
* [Docker](https://www.docker.com/) and Docker Compose, used to run Redis and Postgres
* [Python](https://www.python.org/downloads/) 3.10 or newer, only needed for the chatbot's embedding service
* [PM2](https://pm2.keymetrics.io/), only needed for production

Install PM2 globally if you plan to run this in production:

```bash
npm install -g pm2
```

---

## Quick Start

These steps get everything running on your own computer for the first time.

### 1. Get The Code

```bash
git clone https://github.com/your-org/acra.git
cd acra
```

Replace the link above with your own repository's clone link.

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Start Redis And Postgres

Both are run inside Docker so you do not need to install them yourself.

```bash
pnpm infra
```

Check that both containers are running:

```bash
docker ps
```

You should see `book-editor-redis` and `chatbot-postgres` in the list.

### 4. Set Up The Embedding Service, Chatbot Only

The chatbot needs a small Python service that turns text into search vectors. This step creates its own isolated Python environment so it never conflicts with anything else on your machine.

```bash
cd apps/embedding-svc
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

On macOS or Linux, replace `venv\Scripts\activate` with `source venv/bin/activate`.

### 5. Create The Environment Files

See [Environment Files, Quick Reference](#environment-files-quick-reference) below for a copyable starting point, or open [docs/book-editor.md](docs/book-editor.md#environment-variables) and [docs/chatbot.md](docs/chatbot.md#environment-variables) for a full explanation of every single value.

### 6. Run Database Migrations

```bash
pnpm setup
```

This creates the Book Editor's database and the Chatbot's database, including the search index tables.

### 7. Start Everything

```bash
pnpm dev:all
```

This single command starts the Book Editor web app, the Book Editor API, the Book Editor worker, the Chatbot API, the Chatbot live chat worker, the Chatbot ingestion worker, and the embedding service, all at once.

### 8. Open It In Your Browser

| Service | Address |
| --- | --- |
| Book Editor web app | [http://localhost:5555](http://localhost:5555) |
| Book Editor API docs | [http://localhost:5556/docs](http://localhost:5556/docs) |
| Chatbot API docs | [http://localhost:5557/docs](http://localhost:5557/docs) |
| Chatbot test chat page | [http://localhost:5557/test-chat.html](http://localhost:5557/test-chat.html) |

---

## Environment Files, Quick Reference

Four files are needed, none of them committed to the repository since they hold secret keys. The values below are enough to run everything locally. For a full explanation of what every single variable means, see [docs/book-editor.md](docs/book-editor.md#environment-variables) and [docs/chatbot.md](docs/chatbot.md#environment-variables).

`apps/api/.env`

```env
PORT=5556
DATABASE_URL="file:./dev.db"
REDIS_HOST=localhost
REDIS_PORT=6379
DEEPSEEK_API_KEY=your_deepseek_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com/beta
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_MAX_OUTPUT_TOKENS=64000
UPLOAD_DIR=uploads
OUTPUT_DIR=outputs
CHUNK_CONCURRENCY=2
MIN_CHUNK_SIZE=8000
MAX_CHUNK_SIZE=15000
MAX_HEADING_LENGTH=80
MAX_FILE_SIZE_MB=100
```

`apps/web/.env.local`

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5556
API_INTERNAL_URL=http://localhost:5556
NEXT_TELEMETRY_DISABLED=1
```

`apps/chatbot/.env`

```env
PORT=5557
CHATBOT_DATABASE_URL="postgresql://chatbot:chatbot@localhost:5433/chatbot"
REDIS_HOST=localhost
REDIS_PORT=6379
DEEPSEEK_API_KEY=your_deepseek_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com/beta
DEEPSEEK_MODEL=deepseek-v4-flash
EMBEDDING_SERVICE_URL=http://localhost:5558
EMBEDDING_SERVICE_SECRET=choose_any_shared_secret_here
MESSENGER_VERIFY_TOKEN=choose_any_verification_word_here
ENABLE_TEST_ROUTES=true
```

`apps/embedding-svc/.env`

```env
PORT=5558
EMBEDDING_MODEL=intfloat/multilingual-e5-small
EMBEDDING_SERVICE_SECRET=choose_any_shared_secret_here
```

`EMBEDDING_SERVICE_SECRET` must be exactly the same word in both `apps/chatbot/.env` and `apps/embedding-svc/.env`.

---

## Production Deployment With PM2

These steps assume one Linux server running both apps, Redis, Postgres, and the embedding service.

### 1. Get The Code

```bash
git clone https://github.com/your-org/acra.git project-folder
cd project-folder
```

If the project is already on the server:

```bash
cd project-folder
git pull
```

### 2. Install Dependencies

```bash
pnpm install --frozen-lockfile
```

### 3. Create Environment Files

Create all four files listed in [Environment Files, Quick Reference](#environment-files-quick-reference) above, using real production values. Make sure `DEEPSEEK_API_KEY` is set before starting.

### 4. Set Up The Embedding Service's Python Environment

```bash
cd apps/embedding-svc
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ../..
```

### 5. Start Redis And Postgres

```bash
pnpm infra
docker ps
```

You should see `book-editor-redis` and `chatbot-postgres` running.

### 6. Prepare Both Databases

```bash
pnpm setup
```

### 7. Build The Web App

```bash
pnpm build
```

### 8. Start Everything With PM2

```bash
pnpm pm2:start
```

PM2 starts these processes:

| PM2 process | Purpose | Port |
| --- | --- | --- |
| `book-api` | Book Editor API | `5556` |
| `book-worker` | Book Editor background worker | none, internal |
| `book-web` | Book Editor website | `5555` |
| `chatbot-api` | Chatbot API and webhook | `5557` |
| `chatbot-worker` | Chatbot live reply worker | none, internal |
| `chatbot-ingest-worker` | Chatbot historical data worker | none, internal |
| `chatbot-embed` | Embedding service | `5558` |

### 9. Save The PM2 Process List

This lets PM2 bring everything back automatically after a server reboot.

```bash
pm2 save
pm2 startup
```

`pm2 startup` prints one command near the end. Copy and run that command once.

### 10. Check Production Status

```bash
pnpm pm2:status
pnpm pm2:logs
```

View one process at a time:

```bash
pm2 logs chatbot-api
pm2 logs chatbot-worker
pm2 logs chatbot-ingest-worker
```

---

## Updating Production

```bash
cd project-folder
git pull
pnpm install --frozen-lockfile
pnpm setup
pnpm build
pnpm pm2:restart
```

If PM2 process definitions themselves changed:

```bash
pnpm pm2:delete
pnpm pm2:start
pm2 save
```

---

## Reverse Proxy

In production, put [Nginx](https://nginx.org/), [Caddy](https://caddyserver.com/), or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) in front of both apps, using real domain names instead of ngrok.

Typical setup:

| Public path | Internal target |
| --- | --- |
| `/` | `http://localhost:5555` |
| `/api/*` | `http://localhost:5556` |
| Chatbot's `/webhook` | `http://localhost:5557/webhook` |
| Chatbot's `/api/*` and `/docs` | `http://localhost:5557` |

The chatbot's webhook address must be a stable, permanent domain in production, since Meta stores it and will not follow a changing ngrok address the way local development does.

---

## Backup Checklist

At minimum, back up:

```txt
apps/api/prisma/dev.db
uploads/
outputs/
apps/api/.env
apps/web/.env.local
apps/chatbot/.env
apps/embedding-svc/.env
```

The chatbot's own database lives inside the `chatbot-postgres` Docker volume, and should be backed up using Postgres's own backup tool:

```bash
docker exec chatbot-postgres pg_dump -U chatbot chatbot > backups/chatbot-backup-$(date +%Y-%m-%d).sql
```

---

## Useful Commands

Start everything for local development:

```bash
pnpm dev:all
```

Start only the Book Editor:

```bash
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

Start only the Chatbot:

```bash
pnpm dev:chatbot
pnpm dev:chatbot-worker
pnpm dev:chatbot-ingest-worker
pnpm dev:embed
```

Open Prisma Studio, a visual database browser:

```bash
pnpm prisma:studio
pnpm prisma:studio:chatbot
```

Create demo data for the Chatbot, useful for trying out the [test chat page](http://localhost:5557/test-chat.html) without any real Facebook setup:

```bash
pnpm chatbot:seed
```

Format code:

```bash
pnpm format
```

---

## Troubleshooting

This section covers the most common issues. For the full troubleshooting list for each app, see [docs/book-editor.md](docs/book-editor.md#troubleshooting) and [docs/chatbot.md](docs/chatbot.md#troubleshooting).

**Book Editor upload works but processing does not start.** Check Redis is running with `docker ps`, then check the worker's own logs, `pm2 logs book-worker`.

**Chatbot receives no reply after a real Messenger message.** Confirm the Page itself is subscribed to your app, the single most commonly missed step, explained fully in [docs/chatbot.md](docs/chatbot.md#connecting-a-real-facebook-page).

**DeepSeek errors appear in either app's logs.** Check `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, and `DEEPSEEK_MODEL` in the relevant `.env` file.

**Embedding service will not start.** Make sure its Python virtual environment was created and its dependencies were installed, and confirm `EMBEDDING_SERVICE_SECRET` matches between `apps/chatbot/.env` and `apps/embedding-svc/.env`.

---

## Notes

* All AI behavior, including model choice and safety settings, is controlled on the server through environment variables. Browser users never choose or change AI settings directly.
* Redis must be running before either app's worker can process jobs.
* Postgres must be running before the Chatbot can start.
* One Client's knowledge base is kept in its own isolated section of the database, so one company's data is never mixed into another company's chatbot replies.
