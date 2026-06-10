-- CreateTable
CREATE TABLE "BookJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "completedChunks" INTEGER NOT NULL DEFAULT 0,
    "failedChunks" INTEGER NOT NULL DEFAULT 0,
    "outputTxtPath" TEXT,
    "outputDocxPath" TEXT,
    "warningSummary" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BookChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "chapterTitle" TEXT,
    "originalText" TEXT NOT NULL,
    "correctedText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BookChunk_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BookJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BookChunk_jobId_chunkIndex_key" ON "BookChunk"("jobId", "chunkIndex");
