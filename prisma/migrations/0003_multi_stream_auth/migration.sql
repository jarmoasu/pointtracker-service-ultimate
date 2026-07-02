-- CreateTable
CREATE TABLE "StreamAuth" (
    "streamId" TEXT NOT NULL PRIMARY KEY,
    "claimCodeHash" TEXT NOT NULL,
    "claimCodePlaintext" TEXT,
    "activeWriteTokenHash" TEXT,
    "activeWriterName" TEXT,
    "claimedAt" DATETIME,
    "lastRequestId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AdminAuth" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "adminPasswordHash" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "StreamState" ADD COLUMN "label" TEXT NOT NULL DEFAULT '';

-- Carry the existing single court's claim code / writer state from the old
-- singleton AuthState onto its StreamState row's new per-court StreamAuth row.
INSERT INTO "StreamAuth" ("streamId", "claimCodeHash", "claimCodePlaintext", "activeWriteTokenHash", "activeWriterName", "claimedAt", "lastRequestId", "updatedAt", "createdAt")
SELECT s."streamId", a."claimCodeHash", a."claimCodePlaintext", a."activeWriteTokenHash", a."activeWriterName", a."claimedAt", a."lastRequestId", a."updatedAt", a."createdAt"
FROM "StreamState" s, "AuthState" a
WHERE a."id" = 1;

-- Carry the admin password over to the new global AdminAuth singleton.
INSERT INTO "AdminAuth" ("id", "adminPasswordHash", "updatedAt", "createdAt")
SELECT 1, a."adminPasswordHash", a."updatedAt", a."createdAt"
FROM "AuthState" a
WHERE a."id" = 1;

-- DropTable
DROP TABLE "AuthState";
