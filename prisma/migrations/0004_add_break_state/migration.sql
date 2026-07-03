-- AlterTable
ALTER TABLE "StreamState" ADD COLUMN "breakActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StreamState" ADD COLUMN "breakType" TEXT;
ALTER TABLE "StreamState" ADD COLUMN "breakStartedAt" DATETIME;
