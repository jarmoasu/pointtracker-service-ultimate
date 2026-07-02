-- AlterTable
ALTER TABLE "StreamState" ADD COLUMN "clockRunning" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StreamState" ADD COLUMN "clockStartedAt" DATETIME;
