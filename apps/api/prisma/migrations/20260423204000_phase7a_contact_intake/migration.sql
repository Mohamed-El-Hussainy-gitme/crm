ALTER TYPE "PipelineStage" ADD VALUE IF NOT EXISTS 'VISIT';
ALTER TYPE "PipelineStage" ADD VALUE IF NOT EXISTS 'FREE_TRIAL';

ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "normalizedPhone" TEXT,
  ADD COLUMN IF NOT EXISTS "locationText" TEXT,
  ADD COLUMN IF NOT EXISTS "area" TEXT,
  ADD COLUMN IF NOT EXISTS "mapUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "placeLabel" TEXT;

UPDATE "Contact"
SET "normalizedPhone" = regexp_replace("phone", '[^0-9]', '', 'g')
WHERE "normalizedPhone" IS NULL;

CREATE INDEX IF NOT EXISTS "Contact_normalizedPhone_idx" ON "Contact"("normalizedPhone");
CREATE INDEX IF NOT EXISTS "Contact_locationText_idx" ON "Contact"("locationText");
CREATE INDEX IF NOT EXISTS "Contact_area_idx" ON "Contact"("area");
