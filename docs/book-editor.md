# Book Editor, Full Documentation

This document explains everything about the Book Editor app in simple English: how it works, every environment variable it reads, every API endpoint it exposes, and every command you need to run it. It covers two folders in this repository, `apps/api` (the backend) and `apps/web` (the website).

Return to the [main README](../README.md).

## Table Of Contents

* [What This App Does](#what-this-app-does)
* [Folder Layout](#folder-layout)
* [How It Works, Step By Step](#how-it-works-step-by-step)
* [How Content Splitting Works](#how-content-splitting-works)
* [How The Content Warning Scan Works](#how-the-content-warning-scan-works)
* [What Is Stored In The Database](#what-is-stored-in-the-database)
* [Environment Variables](#environment-variables)
* [Running It On Your Own Computer](#running-it-on-your-own-computer)
* [Every API Endpoint](#every-api-endpoint)
* [The Background Worker Explained](#the-background-worker-explained)
* [The Queue Dashboard](#the-queue-dashboard)
* [Common Commands](#common-commands)
* [Troubleshooting](#troubleshooting)

## What This App Does

A person uploads a Burmese book file. The server reads the text out of that file, breaks the book into small, safe pieces, sends each piece to the DeepSeek AI model for correction, checks the corrected text for sensitive content, and then produces two downloadable files, a plain text file and a Word document.

The person using the website never chooses AI settings themselves. Every setting that controls the AI, such as which model is used and how large each piece is, is controlled by the server through environment variables, explained fully below.

## Folder Layout

```txt
apps/
  api/
    src/
      routes/       Every HTTP endpoint (upload, jobs, files, docs)
      services/     Text extraction, splitting, DeepSeek calls, warning scan, docx building
      queues/       The background job queue and the worker that processes it
      db/           The Prisma database connection
      utils/        Small shared helpers, such as logging and retrying
      validation/   Checks on what comes in and what goes out of each endpoint
      openapi.js    The written API documentation shown at /docs
    prisma/
      schema.prisma The database table definitions
  web/
    app/            The Next.js website pages
    components/     Reusable pieces of the website
```

## How It Works, Step By Step

1. A person opens the website and uploads a `.docx`, `.pdf`, or `.txt` file.
2. The API saves that file inside the `uploads` folder on the server.
3. A job record is created in the database with the status `UPLOADED`.
4. The job is placed on a Redis queue so it can be processed in the background, without making the person wait on the upload screen.
5. A separate background process, called the worker, picks the job up and moves its status to `EXTRACTING`, then reads the plain text out of the file.
6. The worker moves the status to `SPLITTING` and divides that text into smaller pieces, small enough for the AI to correct reliably. See [How Content Splitting Works](#how-content-splitting-works) for the full explanation.
7. The worker moves the status to `PROCESSING`. Each piece is sent to DeepSeek one at a time, or a few at a time depending on settings, and the AI returns a corrected version of that piece using a strict, checkable format rather than free text.
8. As soon as one piece is corrected, it is saved immediately. This means a person can preview finished parts of their book before the whole job is done.
9. Each corrected piece is also scanned for political content, adult or sexual content, and boy love (BL) content, so the person gets a warning summary alongside their book.
10. Once every piece is done, the worker moves the status to `GENERATING_OUTPUT` and stitches every corrected piece back together into two final files, `final.txt` and `final.docx`, saved inside the `outputs` folder.
11. The job status becomes `COMPLETED`. If some pieces failed while others succeeded, the status becomes `PARTIALLY_COMPLETED` instead, and those pieces can be retried. If everything failed, the status becomes `FAILED`.

The full list of statuses, in order, is:

```txt
UPLOADED -> EXTRACTING -> SPLITTING -> PROCESSING -> GENERATING_OUTPUT -> COMPLETED
```

## How Content Splitting Works

Large books cannot be sent to the AI in one piece, both because of size limits and because smaller pieces are corrected more reliably. The splitting logic works in two passes.

**First pass, look for chapter headings.** The text is scanned line by line for lines that look like a heading, either because they match a known heading pattern from `CHAPTER_HEADING_PATTERNS`, or because a short, standalone line sits by itself with blank lines above and below it. Each heading starts a new section, so chapters generally stay together.

**Second pass, resize each section.** If a section is still too large after the first pass, defined by `MAX_CHUNK_SIZE`, it is divided further along paragraph breaks, keeping each piece above `MIN_CHUNK_SIZE` where possible so pieces are not too small either. If a single paragraph is still too large on its own, it is divided one more time along sentence boundaries, as a last resort.

## How The Content Warning Scan Works

After a piece of text is corrected, it is sent to DeepSeek a second time with a different, simple question, does this text contain political content, adult or sexual content, or boy love content. The AI answers with a found or not found flag, a severity level (none, low, medium, or high), and any notes, for each of the three categories separately. If this scan itself fails for any reason, the app quietly treats that piece as having no warnings rather than failing the whole job, since the scan is a helpful extra, not a required step.

Once every piece is finished, all of the individual warning results are combined into one summary for the whole book, keeping the highest severity seen in each category.

## What Is Stored In The Database

The Book Editor uses a small file based database called SQLite, which needs no separate server to run. Two tables matter here.

**BookJob**, one row per uploaded book. Stores the file name, the file type, which AI model was used, the current status, how many total pieces there are, how many finished successfully, how many failed, the warning summary, and a running log of what happened during processing.

**BookChunk**, one row per piece of the book. Stores which job it belongs to, its position in the book, its chapter title if one was found, its original text, its corrected text once done, and its own status.

## Environment Variables

Create a file at `apps/api/.env`. Every variable below can go in that one file.

| Variable | Meaning | Example |
| --- | --- | --- |
| `PORT` | Which port the API server listens on. | `5556` |
| `DATABASE_URL` | Where the SQLite database file lives. Almost never needs to change. | `file:./dev.db` |
| `REDIS_HOST` | The address of the Redis server used for the background job queue. | `localhost` |
| `REDIS_PORT` | The port Redis listens on. | `6379` |
| `DEEPSEEK_API_KEY` | Your secret key for calling the DeepSeek AI. Required, the app cannot correct any text without it. | `sk_your_real_key_here` |
| `DEEPSEEK_BASE_URL` | The web address DeepSeek's API is reached at. | `https://api.deepseek.com/beta` |
| `DEEPSEEK_MODEL` | Which DeepSeek model is used for correction and the warning scan. | `deepseek-v4-flash` |
| `DEEPSEEK_MAX_OUTPUT_TOKENS` | The largest reply size allowed from the AI for one piece, measured in tokens, which are small chunks of text. | `64000` |
| `UPLOAD_DIR` | The folder where uploaded book files are saved. | `uploads` |
| `OUTPUT_DIR` | The folder where generated `final.txt` and `final.docx` files are saved. | `outputs` |
| `CHUNK_CONCURRENCY` | How many pieces are sent to the AI at the same time for one book. A higher number finishes faster but uses more DeepSeek capacity at once. | `2` |
| `MIN_CHUNK_SIZE` | The smallest a piece should be, in characters, before the splitter tries to combine it with more text. | `8000` |
| `MAX_CHUNK_SIZE` | The largest a piece is allowed to be, in characters, before the splitter divides it further. | `15000` |
| `MAX_HEADING_LENGTH` | The longest a line can be, in characters, and still be considered a possible chapter heading. | `80` |
| `CHAPTER_HEADING_PATTERNS` | A comma separated list of text patterns that should always be treated as chapter headings, useful for books with a consistent heading style. Optional. | `^Chapter\s*\d+` |
| `MAX_FILE_SIZE_MB` | The largest upload allowed, in megabytes. | `100` |
| `LOG_LEVEL` | How much detail is printed in server logs. One of `debug`, `info`, `warn`, or `error`. Optional, defaults to `info`. | `info` |
| `PUBLIC_API_BASE_URL` | The public web address of this API, used only inside the API documentation page. Optional, defaults to `http://localhost:<PORT>`. | `https://api.yourcompany.com` |

Create a second file at `apps/web/.env.local` for the website itself.

| Variable | Meaning | Example |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | The address the browser itself uses to reach the API. | `http://localhost:5556` |
| `API_INTERNAL_URL` | The address the website's own server uses to reach the API, which can be the same value as above on one machine. | `http://localhost:5556` |
| `NEXT_TELEMETRY_DISABLED` | Turns off Next.js's own anonymous usage reporting. | `1` |

## Running It On Your Own Computer

Every command below can be copied and pasted exactly as written.

Install every dependency in the whole project, run once from the repository's root folder:

```bash
pnpm install
```

Start Redis using Docker:

```bash
pnpm redis
```

Create the two environment files described above, then run the database migration, which creates the SQLite database file:

```bash
pnpm --filter api prisma:migrate
```

Start the website, the API, and the background worker together:

```bash
pnpm dev
```

Open the website:

```txt
http://localhost:5555
```

## Every API Endpoint

Full interactive documentation, where you can try each endpoint directly in your browser, is available once the API is running:

```txt
http://localhost:5556/docs
```

The raw specification, if you need it for another tool, is at:

```txt
http://localhost:5556/openapi.json
```

### Upload A Book

```bash
curl -X POST http://localhost:5556/api/upload \
  -F "file=@/path/to/your/book.docx"
```

Returns a `jobId`, which every other endpoint below needs.

### List Every Job

```bash
curl http://localhost:5556/api/jobs
```

### Check One Job's Status

```bash
curl http://localhost:5556/api/jobs/PASTE_JOB_ID_HERE
```

Returns the current status, how many pieces are done, and a running log.

### Preview Finished Pieces Before The Whole Job Is Done

```bash
curl http://localhost:5556/api/jobs/PASTE_JOB_ID_HERE/preview
```

### Get The Final Result

```bash
curl http://localhost:5556/api/jobs/PASTE_JOB_ID_HERE/result
```

Returns download links and the content warning summary, once the job has finished.

### Download The Corrected Text File

```bash
curl -O http://localhost:5556/api/files/PASTE_JOB_ID_HERE/final.txt
```

### Download The Corrected Word Document

```bash
curl -O http://localhost:5556/api/files/PASTE_JOB_ID_HERE/final.docx
```

### Retry Any Failed Pieces

```bash
curl -X POST http://localhost:5556/api/jobs/PASTE_JOB_ID_HERE/retry
```

### Clear Every Job

This permanently deletes every job, every uploaded file, and every generated output file. Use with care.

```bash
curl -X DELETE http://localhost:5556/api/jobs
```

## The Background Worker Explained

The worker is a separate, always running process from the API server. The website talks to the API, and the API only ever creates a job and places it on the queue, it never corrects text itself. The worker is the process that actually talks to DeepSeek and does the real work, one job at a time by default, though pieces inside one job can run a few at a time, controlled by `CHUNK_CONCURRENCY`.

Keeping the API and the worker separate means a person uploading a book gets an instant response, while the slow AI correction work happens quietly in the background.

Start the worker by itself:

```bash
pnpm dev:worker
```

## The Queue Dashboard

A visual dashboard of the Redis job queue is available once the API is running, useful for seeing exactly what is queued, in progress, completed, or failed:

```txt
http://localhost:5556/admin/queues
```

In production, this address should be protected or blocked from the public internet, since it exposes internal job data.

## Common Commands

Start everything at once:

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

Start only the website:

```bash
pnpm dev:web
```

Open a visual browser of the database:

```bash
pnpm prisma:studio
```

Reset the database, for local development only, this deletes every job:

```bash
pnpm prisma:clear
```

Format every file in the whole project:

```bash
pnpm format
```

## Troubleshooting

**Upload succeeds but nothing happens afterward.** Confirm Redis is running with `docker ps`, then read the worker's own log for the real error:

```bash
pm2 logs book-worker
```

**DeepSeek errors show up in the log.** Confirm `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, and `DEEPSEEK_MODEL` are all correct in `apps/api/.env`. If a piece is too large and keeps failing, lower `MAX_CHUNK_SIZE`.

**The final files never appear.** Read the worker's log for the exact failure, and confirm the `outputs` folder exists and the server is allowed to write to it.

**The website cannot reach the API.** Confirm `NEXT_PUBLIC_API_BASE_URL` and `API_INTERNAL_URL` in `apps/web/.env.local` are correct, then rebuild:

```bash
pnpm build
pnpm pm2:restart
```
