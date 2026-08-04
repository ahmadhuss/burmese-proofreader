# RAG Messenger Chatbot, Full Documentation

This document explains everything about the Chatbot in simple English: how it works, every environment variable it reads, every API endpoint it exposes, and every command you need to run it, seed it with test data, connect it to a real Facebook Page, and load in real historical conversations. It covers two folders in this repository, `apps/chatbot` (the main backend) and `apps/embedding-svc` (a small helper service).

Return to the [main README](../README.md).

## Table Of Contents

* [What This App Does](#what-this-app-does)
* [The Big Idea In Simple Words](#the-big-idea-in-simple-words)
* [Folder Layout](#folder-layout)
* [What "Client" Means Here](#what-client-means-here)
* [How Learning Works, The Ingestion Pipeline](#how-learning-works-the-ingestion-pipeline)
* [How Answering Works, The Live Reply Pipeline](#how-answering-works-the-live-reply-pipeline)
* [Why A Separate Embedding Service](#why-a-separate-embedding-service)
* [What Is Stored In The Database](#what-is-stored-in-the-database)
* [Environment Variables](#environment-variables)
* [Running It On Your Own Computer](#running-it-on-your-own-computer)
* [Trying It Without A Real Facebook Page](#trying-it-without-a-real-facebook-page)
* [Every API Endpoint](#every-api-endpoint)
* [Connecting A Real Facebook Page](#connecting-a-real-facebook-page)
* [Loading Historical Conversations](#loading-historical-conversations)
* [The Background Workers Explained](#the-background-workers-explained)
* [Common Commands](#common-commands)
* [Troubleshooting](#troubleshooting)

## What This App Does

Instead of a rigid, menu based Facebook bot where a customer has to press numbered options, this chatbot reads a real question typed by a real customer, searches that one company's own past Messenger conversations for the closest matching answers, and asks the DeepSeek AI to write a natural, human sounding reply using that context. This approach is called RAG, short for Retrieval Augmented Generation. In the simplest words possible, look up the real answer first, then let the AI turn it into a natural sentence, rather than letting the AI guess.

## The Big Idea In Simple Words

Two completely separate jobs happen inside this app, and it helps to keep them apart in your head.

**Job one, learning.** Before the bot can answer anyone well, it has to study a company's old Messenger conversations and turn them into a clean, organized list of known questions and their answers. This only needs to happen once per batch of history, and again occasionally as new conversations pile up.

**Job two, answering.** Once learning has produced that organized list, real customer messages are answered live, in seconds, every time someone writes to the Page.

## Folder Layout

```txt
apps/
  chatbot/
    src/
      routes/               Every HTTP endpoint (webhook, clients, ingestion, test chat, docs)
      services/              The live reply pipeline (retrieval, DeepSeek, Messenger sending)
      services/ingestion/    The four learning stages (pull, parse, segment, curate, embed)
      queues/                Background job queues and the two worker processes
      db/                    The Prisma database connection and raw vector search code
      cli/                   Command line tools for backfilling, pulling, and seeding data
      openapi.js             The written API documentation shown at /docs
    prisma/
      schema.prisma          The database table definitions
    public/
      test-chat.html         A simple browser page for testing replies without real Facebook
  embedding-svc/
    main.py                  The one endpoint that turns text into a search vector
    server.py                Starts the web server
```

## What "Client" Means Here

In this project, a Client means one company using the chatbot, which in practice means one Facebook Page. A Client is not an individual customer chatting on Messenger. Every individual customer is identified separately by their own `psid`, a unique id Facebook assigns to that one person for that one Page. So one Client can have thousands of customers messaging it, and every one of those conversations feeds into that single Client's own shared knowledge base. Two different Clients never share knowledge, and a search for one Client's knowledge can never accidentally return another Client's data, this separation is enforced at the database storage level, not just by a filter in application code.

## How Learning Works, The Ingestion Pipeline

Learning happens in four stages, run one after another automatically by background workers. Each stage writes to the database as it finishes, so if the server restarts partway through, nothing is lost and nothing is duplicated.

**Stage one, pull.** The raw conversation history is brought in, either read from a file Meta gave the company, or pulled directly from Facebook's Graph API. See [Loading Historical Conversations](#loading-historical-conversations) for exactly how to trigger this.

**Stage two, segment.** The raw messages for one customer are split into separate conversations. A gap in time longer than `EPISODE_IDLE_GAP_MS`, four hours by default, marks the end of one conversation and the start of a new one.

**Stage three, curate.** Each separate conversation is sent to DeepSeek, with a simple instruction, find any clean, reusable question and answer pairs in this conversation, and ignore greetings, small talk, and one word replies. DeepSeek returns a clean list of question and answer pairs, which are saved to the database marked as pending embedding.

**Stage four, embed and check for duplicates.** Each pending question is turned into a search vector by the embedding service. Before it is saved as ready to use, it is compared against everything already saved for that same Client and category. If a very similar question, above ninety seven percent similarity, already exists and is marked ready, the new one is marked as a duplicate instead of being saved again. Only entries marked ready are ever used to answer real customers, so duplicates never affect answer quality, they simply avoid wasting storage.

## How Answering Works, The Live Reply Pipeline

1. A customer sends a message to the Facebook Page.
2. Facebook delivers that message to this app's webhook address as an instant web request.
3. The app immediately replies to Facebook with a success response, so Facebook never times out or resends the same message, then does the real work quietly afterward.
4. The message is checked against a security signature to confirm it truly came from Facebook and was not forged.
5. The customer's question is turned into a search vector by the embedding service.
6. The database is searched for the closest matching saved answers, but only within that one Client's own knowledge, never any other Client's.
7. DeepSeek is given those matching answers, plus the customer's recent conversation history, and asked to write one natural reply.
8. DeepSeek also returns a confidence score. If that score is too low, or DeepSeek marks the conversation as needing a human, the conversation is flagged for a team member to follow up on, and a safe, polite fallback reply is used instead of a guess.
9. The reply is sent back to the customer through Facebook's own Send API.
10. Both the customer's message and the bot's reply are saved, along with exactly which saved answers were used, so replies can be reviewed and improved later.

## Why A Separate Embedding Service

DeepSeek is excellent at writing replies, but it does not offer any way to turn a sentence into a search vector, which is the numeric fingerprint needed to find similar meaning quickly. A second, much smaller model handles that one job instead. This app uses a free, open model called `intfloat/multilingual-e5-small`. It understands many languages, including Burmese, and it is small enough to run on an ordinary computer processor, with no graphics card required, keeping running costs low.

## What Is Stored In The Database

The Chatbot uses PostgreSQL, a proper server based database, together with an extension called pgvector that adds the ability to search by meaning rather than exact words. The main tables are:

**Client**, one row per company, storing its name, its Facebook Page id, its access token, its app secret, its system prompt (instructions describing how the bot should behave), and which embedding model it uses.

**KnowledgeChunk**, one row per learned question and answer pair, storing which Client it belongs to, the question, the answer, a topic category, its search vector, and its status, pending embedding, ready, or duplicate. Every Client's rows are physically kept in their own separate section of this table, which is what guarantees one Client's data can never leak into another Client's answers.

**ConversationSession**, one row per ongoing conversation between one Client and one customer, tracking whether it is active, escalated to a human, or closed.

**ConversationMessage**, one row per message sent or received inside a session, storing who sent it, what it said, and which saved answers were used to generate it, if any.

**IngestionBatch**, **RawMessage**, and **ConversationEpisode**, the working tables used only during the four learning stages described above.

## Environment Variables

Create a file at `apps/chatbot/.env`.

| Variable | Meaning | Example |
| --- | --- | --- |
| `PORT` | Which port the chatbot API server listens on. | `5557` |
| `CHATBOT_DATABASE_URL` | The full connection address for the Postgres database. The example value matches the Postgres container started by `pnpm infra`, so it works immediately on your own computer. | `postgresql://chatbot:chatbot@localhost:5433/chatbot` |
| `REDIS_HOST` | The address of the Redis server used for background job queues. | `localhost` |
| `REDIS_PORT` | The port Redis listens on. | `6379` |
| `DEEPSEEK_API_KEY` | Your secret key for calling the DeepSeek AI. Required for both learning and answering. | `sk_your_real_key_here` |
| `DEEPSEEK_BASE_URL` | The web address DeepSeek's API is reached at. | `https://api.deepseek.com/beta` |
| `DEEPSEEK_MODEL` | Which DeepSeek model writes replies and extracts knowledge during learning. | `deepseek-v4-flash` |
| `EMBEDDING_SERVICE_URL` | The web address of the embedding service. | `http://localhost:5558` |
| `EMBEDDING_SERVICE_SECRET` | A shared secret word that only this app and the embedding service know, so the embedding service refuses requests from anyone else. Must exactly match the same variable in `apps/embedding-svc/.env`. Invent any word or phrase. | `some-shared-secret-word` |
| `MESSENGER_VERIFY_TOKEN` | A word you invent, typed into Facebook's dashboard when connecting a real Page, proving the webhook connection request truly came from you. See [Connecting A Real Facebook Page](#connecting-a-real-facebook-page). | `my-verify-word-123` |
| `FACEBOOK_GRAPH_API_VERSION` | Which version of Facebook's Graph API is used for every Facebook call. Optional, has a safe default. | `v21.0` |
| `RETRIEVAL_TOP_K` | How many saved answers are retrieved and shown to DeepSeek for each customer question. Optional, defaults to five. | `5` |
| `REPLY_CONFIDENCE_THRESHOLD` | The minimum confidence score, from zero to one, that DeepSeek must report before a reply is trusted without flagging it for a human. Optional, defaults to a middle value. | `0.55` |
| `FALLBACK_REPLY_TEXT` | The safe reply sent to a customer whenever DeepSeek's confidence is too low or an error happens. Optional, has a sensible default. | `Sorry, I am not fully sure. A team member will follow up with you shortly.` |
| `CONVERSATION_HISTORY_LIMIT` | How many recent messages from one conversation are shown to DeepSeek for context. Optional, defaults to ten. | `10` |
| `EPISODE_IDLE_GAP_MS` | How many milliseconds of silence mark the end of one learned conversation and the start of a new one, during learning. The example equals four hours. Optional. | `14400000` |
| `KNOWLEDGE_EXTRACTION_VERSION` | A version number for the learning process itself. Raise this number to safely relearn every past conversation again after you improve the learning instructions, without creating duplicate entries. Optional, defaults to one. | `1` |
| `MESSAGE_CONCURRENCY` | How many live customer replies can be worked on at the same time. Optional, defaults to five. | `5` |
| `INGEST_CURATE_CONCURRENCY` | How many conversations can be sent to DeepSeek for learning at the same time. Optional, defaults to three. | `3` |
| `INGEST_EMBED_CONCURRENCY` | How many learned questions can be turned into search vectors at the same time. Optional, defaults to five. | `5` |
| `LOG_LEVEL` | How much detail is printed in server logs. One of `debug`, `info`, `warn`, or `error`. Optional, defaults to `info`. | `info` |
| `ENABLE_TEST_ROUTES` | Set to `true` to allow the no real Facebook needed test chat page and endpoint to work even in a production environment. Always on automatically outside production. | `true` |
| `PUBLIC_API_BASE_URL` | The public web address of this API, used only inside the API documentation page. Optional, defaults to `http://localhost:<PORT>`. | `https://chatbot.yourcompany.com` |

Create a second file at `apps/embedding-svc/.env`.

| Variable | Meaning | Example |
| --- | --- | --- |
| `PORT` | Which port the embedding service listens on. | `5558` |
| `EMBEDDING_MODEL` | Which open embedding model is loaded. Changing this changes the size and quality of every search vector, so it should not be changed after real data has already been learned, without relearning everything again. | `intfloat/multilingual-e5-small` |
| `EMBEDDING_SERVICE_SECRET` | Must exactly match `EMBEDDING_SERVICE_SECRET` in `apps/chatbot/.env`, described above. | `some-shared-secret-word` |
| `EMBEDDING_MAX_BATCH_SIZE` | The most pieces of text that can be turned into search vectors in one single request. Optional, defaults to one hundred twenty eight. | `128` |

## Running It On Your Own Computer

Every command below can be copied and pasted exactly as written.

Install every dependency in the whole project, run once from the repository's root folder:

```bash
pnpm install
```

Start Redis and Postgres, both run through Docker:

```bash
pnpm infra
```

Set up the embedding service's own Python environment, this only needs to be done once:

```bash
cd apps/embedding-svc
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cd ../..
```

On macOS or Linux, replace the activation line with:

```bash
source venv/bin/activate
```

Create both `.env` files described above, then run the chatbot's database migration, which creates every table:

```bash
pnpm prisma:migrate:chatbot
```

Start every chatbot process together, the API, the live reply worker, the learning worker, and the embedding service:

```bash
pnpm dev:chatbot
pnpm dev:chatbot-worker
pnpm dev:chatbot-ingest-worker
pnpm dev:embed
```

Or start absolutely everything in this whole repository, both apps, at once:

```bash
pnpm dev:all
```

## Trying It Without A Real Facebook Page

Before connecting anything real, you can try the whole reply pipeline instantly using built in sample data.

Create one demo Client and a handful of already learned sample questions and answers:

```bash
pnpm chatbot:seed
```

Open the test chat page in your browser:

```txt
http://localhost:5557/test-chat.html
```

Type a question such as "what are your shipping times" and watch a real DeepSeek generated reply come back, using the sample knowledge, with no Facebook account needed at all.

## Every API Endpoint

Full interactive documentation, where you can try each endpoint directly in your browser, is available once the chatbot API is running:

```txt
http://localhost:5557/docs
```

The raw specification is at:

```txt
http://localhost:5557/openapi.json
```

### Register A New Client

Registers a new company using the chatbot, and automatically sets up that Client's own private, isolated section of the knowledge database.

```bash
curl -X POST http://localhost:5557/api/clients \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Test Store",
    "facebookPageId": "PASTE_FACEBOOK_PAGE_ID_HERE",
    "pageAccessToken": "PASTE_PAGE_ACCESS_TOKEN_HERE",
    "appSecret": "PASTE_APP_SECRET_HERE",
    "systemPrompt": "You are a helpful support agent for My Test Store."
  }'
```

The response includes an internal `id`. This internal id, not the Facebook Page id, is the Client Id used by every other endpoint below.

### Look Up A Client

```bash
curl http://localhost:5557/api/clients/PASTE_INTERNAL_CLIENT_ID_HERE
```

### Pull Real Conversations From Facebook

See [Loading Historical Conversations](#loading-historical-conversations) below for full examples with every option explained.

```bash
curl -X POST http://localhost:5557/api/ingestion/pull-conversations \
  -H "Content-Type: application/json" \
  -d '{ "clientId": "PASTE_INTERNAL_CLIENT_ID_HERE", "sinceDate": "2020-01-01" }'
```

### Load Conversations From An Already Uploaded File

Used when Meta has already provided a raw export file sitting on the server's own disk, instead of pulling live from the Graph API.

```bash
curl -X POST http://localhost:5557/api/ingestion/batches \
  -H "Content-Type: application/json" \
  -d '{ "clientId": "PASTE_INTERNAL_CLIENT_ID_HERE", "filePath": "/path/on/server/to/export/folder" }'
```

### Check Learning Progress

```bash
curl http://localhost:5557/api/ingestion/batches/PASTE_BATCH_ID_HERE
```

Returns the current stage, how many raw messages and conversations were found, and whether it has reached `COMPLETED`.

### Send A Test Message, No Real Facebook Needed

Runs the exact same reply pipeline a real customer message would trigger, but simply returns the reply in the response instead of sending it through Facebook. Only available when `ENABLE_TEST_ROUTES` is on, described in [Environment Variables](#environment-variables).

```bash
curl -X POST http://localhost:5557/api/test-chat \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "PASTE_INTERNAL_CLIENT_ID_HERE",
    "psid": "test-user-1",
    "text": "What are your shipping times?"
  }'
```

### The Webhook Endpoints

These two endpoints are only ever called by Facebook itself, never by you directly, they are documented here for completeness.

`GET /webhook`, Facebook's one time address verification handshake, performed automatically when you set up the webhook in the Meta dashboard.

`POST /webhook`, where Facebook delivers every real customer message.

## Connecting A Real Facebook Page

These steps connect the chatbot to a real Facebook Page, so you can send it a real message on Messenger and receive a real AI generated reply back.

**Step one, create a Meta developer account and app.** Visit [developers.facebook.com](https://developers.facebook.com/), create an account if needed, create a new App, and add the Messenger product to it.

**Step two, generate a Page Access Token.** Inside the App's Messenger settings, generate an access token for the specific Facebook Page you want to connect.

**Step three, collect three values.** Copy the Page Id, the Page Access Token, and the App Secret. You will need every one of these.

**Step four, register the Client.**

```bash
curl -X POST http://localhost:5557/api/clients \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Test Store",
    "facebookPageId": "PASTE_PAGE_ID_HERE",
    "pageAccessToken": "PASTE_PAGE_ACCESS_TOKEN_HERE",
    "appSecret": "PASTE_APP_SECRET_HERE",
    "systemPrompt": "You are a helpful support agent for My Test Store."
  }'
```

Save the `id` from the response, this is the internal Client Id.

**Step five, open a public tunnel to your own computer.** Facebook's servers need a real, public web address to send messages to. This project has been tested with [ngrok](https://ngrok.com/).

```bash
ngrok http 5557
```

Copy the `https` address ngrok prints.

**Step six, register the webhook in the Meta dashboard.** Under Messenger settings, set:

* Callback URL, your ngrok address followed by `/webhook`, for example `https://your-ngrok-address.ngrok-free.app/webhook`.
* Verify Token, the exact same word you set as `MESSENGER_VERIFY_TOKEN` in `apps/chatbot/.env`.

**Step seven, subscribe the webhook to the `messages` field**, using the checkbox Meta provides next to the webhook fields list.

**Step eight, subscribe the Page itself to your app.** This is a separate step from step seven, and is the most commonly missed one. It is not available as a dashboard checkbox and must be done with a direct call:

```bash
curl -X POST "https://graph.facebook.com/v21.0/PASTE_PAGE_ID_HERE/subscribed_apps?subscribed_fields=messages&access_token=PASTE_PAGE_ACCESS_TOKEN_HERE"
```

**Step nine, send a real test message.** Message the Page from Messenger. If everything above is correct, an AI generated reply arrives within a few seconds. If nothing arrives, see [Troubleshooting](#troubleshooting).

## Loading Historical Conversations

A Facebook Page has no manual download button the way a personal Facebook account does, so historical conversations are pulled directly from Facebook using the Graph API, or loaded from a file if Meta already provided one.

### Pull Every Conversation On The Page

```bash
curl -X POST http://localhost:5557/api/ingestion/pull-conversations \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "PASTE_INTERNAL_CLIENT_ID_HERE",
    "sinceDate": "2020-01-01"
  }'
```

### Pull Only One Customer's Conversation

Add `psid`, the id of one specific customer, to pull only their thread instead of the whole Page.

```bash
curl -X POST http://localhost:5557/api/ingestion/pull-conversations \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "PASTE_INTERNAL_CLIENT_ID_HERE",
    "sinceDate": "2026-01-01",
    "untilDate": "2026-06-30",
    "psid": "PASTE_CUSTOMER_PSID_HERE"
  }'
```

`sinceDate` and `untilDate` are both optional dates written as `YYYY-MM-DD`. Leaving `untilDate` out pulls everything up to today.

### Check On A Pull's Progress

The response from either command above includes a `batchId`.

```bash
curl http://localhost:5557/api/ingestion/batches/PASTE_BATCH_ID_HERE
```

A batch finishes as `COMPLETED`, and the response shows exactly how many conversations and messages were found and learned from.

### The Same Two Options, From The Command Line Instead

Useful for running a pull from a terminal or a scheduled script instead of an HTTP call.

```bash
pnpm ingest:pull-conversations PASTE_INTERNAL_CLIENT_ID_HERE 2020-01-01
```

Add an end date and a customer id as extra, optional words after that, in that same order.

```bash
pnpm ingest:pull-conversations PASTE_INTERNAL_CLIENT_ID_HERE 2026-01-01 2026-06-30 PASTE_CUSTOMER_PSID_HERE
```

### Loading From An Already Provided Export File Instead

```bash
pnpm ingest:backfill PASTE_INTERNAL_CLIENT_ID_HERE path/to/export/folder
```

## The Background Workers Explained

Two separate, always running processes handle all the real work, kept deliberately apart so a huge batch of historical learning never slows down or delays a live customer waiting for a reply right now.

**The live reply worker**, `pnpm dev:chatbot-worker`, watches for real incoming customer messages, and turns each one into a search, a DeepSeek call, and a sent reply, described fully in [How Answering Works](#how-answering-works-the-live-reply-pipeline).

**The learning worker**, `pnpm dev:chatbot-ingest-worker`, runs every one of the four learning stages, pull, segment, curate, and embed, described fully in [How Learning Works](#how-learning-works-the-ingestion-pipeline). Internally this one process actually runs five separate queues, one for pulling from Facebook, one for reading uploaded files, and one for each of the remaining three stages, but they are all started together with the single command above.

## Common Commands

Start every chatbot process at once:

```bash
pnpm dev:chatbot
pnpm dev:chatbot-worker
pnpm dev:chatbot-ingest-worker
pnpm dev:embed
```

Open a visual browser of the chatbot's own database:

```bash
pnpm prisma:studio:chatbot
```

Create sample demo data for local testing:

```bash
pnpm chatbot:seed
```

## Troubleshooting

**No reply arrives after a real Messenger message.** Work through these in order.

1. Read the API's own log for webhook errors.

   ```bash
   pm2 logs chatbot-api
   ```

2. Confirm the Page itself is subscribed to your app, using the `subscribed_apps` call shown in step eight of [Connecting A Real Facebook Page](#connecting-a-real-facebook-page). This is the single most commonly missed step, and is separate from the webhook field checkboxes.
3. Confirm `MESSENGER_VERIFY_TOKEN` in `apps/chatbot/.env` exactly matches the Verify Token typed into the Meta dashboard.
4. Read the reply worker's own log for reply generation errors.

   ```bash
   pm2 logs chatbot-worker
   ```

**A learning batch seems stuck.** Check its exact status directly.

```bash
curl http://localhost:5557/api/ingestion/batches/PASTE_BATCH_ID_HERE
```

Then read the learning worker's own log.

```bash
pm2 logs chatbot-ingest-worker
```

**DeepSeek errors appear in the log.** Confirm `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, and `DEEPSEEK_MODEL` are all correct in `apps/chatbot/.env`.

**The embedding service refuses to start, or every search fails.** Confirm its Python environment was created and its dependencies were installed, described in [Running It On Your Own Computer](#running-it-on-your-own-computer). Also confirm `EMBEDDING_SERVICE_SECRET` is set to the exact same value in both `apps/chatbot/.env` and `apps/embedding-svc/.env`.

**A test message never returns a reply on the test chat page.** Confirm `ENABLE_TEST_ROUTES` is set, and confirm you ran `pnpm chatbot:seed` at least once so there is knowledge for the demo Client to search.
