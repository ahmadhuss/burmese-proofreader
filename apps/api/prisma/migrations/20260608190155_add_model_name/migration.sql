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
    "modelName" TEXT NOT NULL DEFAULT 'deepseek-v3-flash',
    "outputTxtPath" TEXT,
    "outputDocxPath" TEXT,
    "warningSummary" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BookJob" ("completedChunks", "createdAt", "errorMessage", "failedChunks", "fileName", "filePath", "fileType", "id", "outputDocxPath", "outputTxtPath", "status", "totalChunks", "updatedAt", "warningSummary") SELECT "completedChunks", "createdAt", "errorMessage", "failedChunks", "fileName", "filePath", "fileType", "id", "outputDocxPath", "outputTxtPath", "status", "totalChunks", "updatedAt", "warningSummary" FROM "BookJob";
DROP TABLE "BookJob";
ALTER TABLE "new_BookJob" RENAME TO "BookJob";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
