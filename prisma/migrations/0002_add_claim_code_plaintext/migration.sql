-- Add plaintext claim code for admin display.
-- NOTE: keep claimCodeHash for verification; this column is for display/use in admin UI.
ALTER TABLE "AuthState"
ADD COLUMN "claimCodePlaintext" TEXT;

