CREATE TABLE IF NOT EXISTS "UnitPhoto" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "caption" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UnitPhoto_unitId_idx" ON "UnitPhoto"("unitId");
CREATE TABLE IF NOT EXISTS "UnitListing" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "headline" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}',
  "visibleFields" JSONB NOT NULL DEFAULT '[]',
  "coverPhotoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitListing_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UnitListing_unitId_key" ON "UnitListing"("unitId");
DO $$ BEGIN
  ALTER TABLE "UnitPhoto" ADD CONSTRAINT "UnitPhoto_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "UnitListing" ADD CONSTRAINT "UnitListing_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
