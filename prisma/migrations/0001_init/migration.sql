-- CreateTable
CREATE TABLE "StreamState" (
    "streamId" TEXT NOT NULL PRIMARY KEY,
    "homeTeamName" TEXT NOT NULL DEFAULT '',
    "awayTeamName" TEXT NOT NULL DEFAULT '',
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "gameClockSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastScoreTeam" TEXT,
    "lastScorer" TEXT,
    "lastAssist" TEXT,
    "lastScoreClockSeconds" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuthState" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "claimCodeHash" TEXT NOT NULL,
    "claimCodePlaintext" TEXT,
    "activeWriteTokenHash" TEXT,
    "activeWriterName" TEXT,
    "claimedAt" DATETIME,
    "lastRequestId" TEXT,
    "adminPasswordHash" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
