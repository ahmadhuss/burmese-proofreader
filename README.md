# Burmese Proof Reader

Burmese Proof Reader is a web app for correcting Burmese books with LLM.

Users upload a `.docx`, `.pdf`, or `.txt` file. The backend extracts the text, splits the book into safe chunks, corrects each chunk with DeepSeek, scans for content warnings, and creates downloadable `.txt` and `.docx` files.

The user cannot choose or change AI settings from the browser. Model, token limits, chunk sizes, and other processing settings are controlled on the server through environment variables.

---

## Stack

| Part | Technology |
| --- | --- |
| Web app | Next.js, React, Tailwind CSS |
| API | Express.js |
| Background jobs | BullMQ |
| Database | Prisma with SQLite |
| Queue storage | Redis |
| AI provider | DeepSeek using OpenAI-compatible SDK |
| Package manager | pnpm workspaces |
| Production process manager | PM2 |

---

## Project Layout

```txt
project-folder/
  apps/
    api/        Express API, Prisma database, BullMQ worker
    web/        Next.js frontend
  packages/
    prompts/    Shared DeepSeek prompt text
  uploads/      Uploaded source files
  outputs/      Generated final files
```

---

## Requirements

Install these on the server or development machine:

- Node.js 18 or newer
- pnpm 9 or newer
- Docker, used here for Redis
- PM2, for production

Install PM2 globally if it is not already installed:

```bash
npm install -g pm2
```

---

## Environment Files

Create this file:

```txt
apps/api/.env
```

Example:

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
CHAPTER_HEADING_PATTERNS=^á€¡á€á€”á€ºá€¸\s*[\u1040-\u10490-9]+,^á€¡á€•á€­á€¯á€„á€ºá€¸\s*[\u1040-\u10490-9]+
MAX_FILE_SIZE_MB=100
```

Create this file:

```txt
apps/web/.env.local
```

For local development:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5556
API_INTERNAL_URL=http://localhost:5556
NEXT_TELEMETRY_DISABLED=1
```

For production on one server, this can usually stay the same if a reverse proxy serves the web app and API on the same machine. If your API is on another domain, set both URLs to that API address.

---

## Local Development

Install dependencies:

```bash
pnpm install
```

Start Redis:

```bash
pnpm redis
```

Run database migrations:

```bash
pnpm --filter api prisma:migrate
```

Start the web app, API, and worker:

```bash
pnpm dev
```

Local URLs:

| Service | URL |
| --- | --- |
| Web app | http://localhost:5555 |
| API | http://localhost:5556 |
| Queue dashboard | http://localhost:5556/admin/queues |

---

## How Processing Works

1. The user uploads a book.
2. The API saves the file in `uploads/`.
3. A `BookJob` record is created in SQLite.
4. The job is added to the Redis/BullMQ queue.
5. The worker extracts plain text from the file.
6. The text is normalized and split into chunks.
7. Each chunk is corrected by LLM using strict tool calls.
8. Each corrected chunk is saved as soon as it finishes.
9. A warning scan checks for political, adult/sexual, and BL content.
10. The worker creates `final.txt` and `final.docx` in `outputs/{jobId}/`.

Job statuses:

```txt
UPLOADED -> EXTRACTING -> SPLITTING -> PROCESSING -> GENERATING_OUTPUT -> COMPLETED
```

If some chunks fail but others succeed, the job can finish as:

```txt
PARTIALLY_COMPLETED
```

If the whole job fails, the status becomes:

```txt
FAILED
```

---

## Production Deployment With PM2

These steps assume one Linux server running the web app, API, worker, Redis, and SQLite database.

### 1. Get The Code

Clone or copy the project to your server:

```bash
git clone <your-repo-url> project-folder
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

If this is your first deploy and the lockfile is not final yet, use:

```bash
pnpm install
```

### 3. Create Environment Files

Create:

```txt
apps/api/.env
apps/web/.env.local
```

Use the examples from the Environment Files section above.

Make sure `DEEPSEEK_API_KEY` is set before starting production.

### 4. Start Redis

Using Docker Compose:

```bash
pnpm redis
```

Check Redis is running:

```bash
docker ps
```

You should see a container named:

```txt
book-editor-redis
```

### 5. Prepare The Database

Run migrations:

```bash
pnpm --filter api prisma:migrate
```

This creates or updates the SQLite database used by the API.

### 6. Build The Web App

```bash
pnpm build
```

This builds the Next.js app inside `apps/web`.

### 7. Start Everything With PM2

```bash
pnpm pm2:start
```

PM2 starts three processes:

| PM2 process | Purpose |
| --- | --- |
| `book-api` | Express API on port `5556` |
| `book-worker` | Background book processing worker |
| `book-web` | Next.js web app on port `5555` |

### 8. Save The PM2 Process List

This lets PM2 restore the app after a server reboot:

```bash
pm2 save
```

Then enable PM2 startup:

```bash
pm2 startup
```

PM2 will print a command. Copy and run that command once.

### 9. Check Production Status

```bash
pnpm pm2:status
```

View logs:

```bash
pnpm pm2:logs
```

View only one process:

```bash
pm2 logs book-api
pm2 logs book-worker
pm2 logs book-web
```

---

## Updating Production

Use this flow when deploying new code:

```bash
cd project-folder
git pull
pnpm install --frozen-lockfile
pnpm --filter api prisma:migrate
pnpm build
pnpm pm2:restart
```

If the app is already running and you want a smoother restart:

```bash
pnpm pm2:reload
```

If PM2 process definitions changed, use:

```bash
pnpm pm2:delete
pnpm pm2:start
pm2 save
```

---

## Stopping Production

Stop all app processes:

```bash
pnpm pm2:stop
```

Start them again:

```bash
pnpm pm2:start
```

Remove them from PM2:

```bash
pnpm pm2:delete
```

---

## Reverse Proxy

In production, put Nginx, Caddy, Cloudflare Tunnel, or another reverse proxy in front of the app.

Typical setup:

| Public path | Internal target |
| --- | --- |
| `/` | `http://localhost:5555` |
| `/api/*` | `http://localhost:5556` |
| `/admin/queues` | `http://localhost:5556/admin/queues` |

For safety, protect `/admin/queues` with authentication or block it from the public internet.

---

## Important Production Folders

These folders contain real user data:

```txt
uploads/
outputs/
apps/api/prisma/dev.db
```

Back them up if you need to preserve jobs and generated files.

Do not delete these folders during deployment unless you intentionally want to remove uploaded books, generated outputs, and job history.

---

## Backup Checklist

At minimum, back up:

```txt
apps/api/prisma/dev.db
uploads/
outputs/
apps/api/.env
apps/web/.env.local
```

Simple manual backup example:

```bash
mkdir -p backups
tar -czf backups/book-editor-backup-$(date +%Y-%m-%d).tar.gz apps/api/prisma/dev.db uploads outputs apps/api/.env apps/web/.env.local
```

---

## API Endpoints

Interactive API documentation is available when the API is running:

```txt
http://localhost:5556/docs
http://localhost:5556/openapi.json
```

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/upload` | Upload a book and create a job |
| `GET` | `/api/jobs` | List jobs |
| `GET` | `/api/jobs/:id` | Get job status and logs |
| `GET` | `/api/jobs/:id/preview` | Get completed chunks for live preview |
| `GET` | `/api/jobs/:id/result` | Get final output file URLs |
| `GET` | `/api/files/:id/final.txt` | Download corrected text |
| `GET` | `/api/files/:id/final.docx` | Download corrected Word document |
| `POST` | `/api/jobs/:id/retry` | Retry failed chunks |
| `DELETE` | `/api/jobs` | Clear all jobs, queue data, uploads, and outputs |

---

## Adding A New API Endpoint

This section explains the API docs system in simple terms.

Think of one endpoint like one shop counter:

1. The route file is the counter where the work happens.
2. The validation schema checks what the visitor gives you.
3. The response schema describes what you give back.
4. The OpenAPI file writes the public guide.
5. Scalar shows that guide at `/docs`.

### Files You Usually Touch

| Need | File |
| --- | --- |
| Add the real Express route | `apps/api/src/routes/*.routes.js` |
| Validate request params, headers, or body | `apps/api/src/validation/schemas.js` |
| Describe the JSON response | `apps/api/src/validation/response-schemas.js` |
| Register schemas for docs generation | `apps/api/src/openapi-components.js` |
| Add the endpoint to API docs | `apps/api/src/openapi.js` |
| Mount a brand-new route group | `apps/api/src/server.js` |

Most small changes only need the route file, validation files, `openapi-components.js`, and `openapi.js`.

### Simple Flow

Use this checklist when adding a new endpoint.

1. Add the route handler.

Example:

```js
router.get("/summary", async (req, res) => {
  const payload = { message: "API summary" };
  sendJson(res, messageResponseSchema, payload, "summary response");
});
```

2. If the endpoint has inputs, add a request schema.

Examples of inputs:

- `:jobId` in a URL
- query strings like `?page=1`
- headers like `X-Docs-Dry-Run`
- JSON body fields

Request schemas live here:

```txt
apps/api/src/validation/schemas.js
```

3. Add a response schema.

Every JSON response should have a matching Zod schema here:

```txt
apps/api/src/validation/response-schemas.js
```

Keep descriptions simple. Write them for a new teammate, not only for the original developer.

4. Register the schema for automatic docs.

Add the new schema to:

```txt
apps/api/src/openapi-components.js
```

This is the bridge between Zod and OpenAPI. If a schema is not registered here, it will not appear as a reusable schema in `/openapi.json`.

5. Add the endpoint to the OpenAPI paths.

Add the public endpoint description here:

```txt
apps/api/src/openapi.js
```

This is where you write:

- endpoint summary
- endpoint description
- request body docs
- response examples
- status codes

6. Restart the API and check the docs.

```bash
pnpm --filter api start
```

Open:

```txt
http://localhost:5556/docs
http://localhost:5556/openapi.json
```

### How Auto Docs Work

The docs are partly automatic and partly hand-written.

Automatic:

- Zod schemas describe data shapes.
- `openapi-components.js` turns those Zod schemas into OpenAPI schemas.
- `/openapi.json` includes those generated schemas.
- Scalar reads `/openapi.json` and shows the UI at `/docs`.

Hand-written:

- Endpoint summaries
- Endpoint descriptions
- Request examples
- Response examples
- Upload/file download explanations

This is intentional. Data shapes should come from code, but human guidance should be written clearly by a developer.

### Safe Response Validation

Routes can use `sendJson`:

```js
sendJson(res, someResponseSchema, payload, "some response");
```

In development, this checks that the response matches the schema and logs a warning if it does not.

In production, it sends the response normally so the frontend is not blocked by docs validation.

### If You Add A New Route File

If you create a new route file, for example:

```txt
apps/api/src/routes/reports.routes.js
```

mount it in:

```txt
apps/api/src/server.js
```

Example:

```js
const reportsRoutes = require("./routes/reports.routes");
app.use("/api/reports", reportsRoutes);
```

Then add the same endpoint paths to `apps/api/src/openapi.js`.

### Important Rule

Do not only add the Express route.

For every new public JSON endpoint, also add:

- request validation if it accepts input
- response schema
- OpenAPI docs
- example response

That keeps the API, frontend, and documentation easy to trust.

---

## Useful Commands

Development:

```bash
pnpm dev
```

Start only the API:

```bash
pnpm dev:api
```

Start only the worker:

```bash
pnpm dev:worker
```

Start only the web app:

```bash
pnpm dev:web
```

Format code:

```bash
pnpm format
```

Open Prisma Studio:

```bash
pnpm prisma:studio
```

Reset the database in development only:

```bash
pnpm prisma:clear
```

---

## Troubleshooting

### Upload works but processing does not start

Check Redis:

```bash
docker ps
```

Check the worker logs:

```bash
pm2 logs book-worker
```

### DeepSeek errors appear in worker logs

Check:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL=https://api.deepseek.com/beta`
- `DEEPSEEK_MODEL=deepseek-v4-flash`
- `DEEPSEEK_MAX_OUTPUT_TOKENS`

If chunks are too large, reduce:

```env
MAX_CHUNK_SIZE=12000
```

### Final files are missing

Check the job status:

```bash
pm2 logs book-worker
```

Also check that the `outputs/` folder exists and the app can write to it.

### Web app cannot reach API

Check `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5556
API_INTERNAL_URL=http://localhost:5556
```

Then rebuild and restart:

```bash
pnpm build
pnpm pm2:restart
```

### PM2 starts web app but page is old

Rebuild the web app:

```bash
pnpm build
pnpm pm2:restart
```

---

## Notes

- Server environment variables control AI behavior.
- Browser users only upload books and download results.
- Redis must be running before the API and worker process jobs.
- SQLite is simple and fine for a single-server deployment.
- For multiple servers, move the database and file storage to shared production services.

