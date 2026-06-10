-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BookJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "totalChunks" INTEGER NOT NULL DEFAULT 0,
    "completedChunks" INTEGER NOT NULL DEFAULT 0,
    "failedChunks" INTEGER NOT NULL DEFAULT 0,
    "modelName" TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
    "thinkingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reasoningEffort" TEXT NOT NULL DEFAULT 'high',
    "outputTxtPath" TEXT,
    "outputDocxPath" TEXT,
    "warningSummary" TEXT,
    "errorMessage" TEXT,
    "processingLog" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BookJob" SELECT * FROM "BookJob";
DROP TABLE "BookJob";
ALTER TABLE "new_BookJob" RENAME TO "BookJob";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
