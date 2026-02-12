-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "StreamState" (
    "streamId" TEXT NOT NULL,
    "homeTeamName" TEXT NOT NULL DEFAULT '',
    "awayTeamName" TEXT NOT NULL DEFAULT '',
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "gameClockSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastScoreTeam" TEXT,
    "lastScorer" TEXT,
    "lastAssist" TEXT,
    "lastScoreClockSeconds" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamState_pkey" PRIMARY KEY ("streamId")
);

-- CreateTable
CREATE TABLE "AuthState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "claimCodeHash" TEXT NOT NULL,
    "activeWriteTokenHash" TEXT,
    "activeWriterName" TEXT,
    "claimedAt" TIMESTAMP(3),
    "lastRequestId" TEXT,
    "adminPasswordHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthState_pkey" PRIMARY KEY ("id")
);

