-- The lessee document checklist, mirroring LessorRequirement. Additive and
-- idempotent, in line with the other manual migrations here: the committed
-- Prisma history has drifted on the deployed databases, so the table is created
-- directly rather than through it.
CREATE TABLE IF NOT EXISTS "LesseeRequirement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requirementKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Required',
  "filename" TEXT,
  "mimeType" TEXT,
  "size" INTEGER,
  "data" BYTEA,
  "remarks" TEXT,
  "expiresAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewedByName" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LesseeRequirement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LesseeRequirement_tenantId_requirementKey_key"
  ON "LesseeRequirement"("tenantId", "requirementKey");

DO $$ BEGIN
  ALTER TABLE "LesseeRequirement" ADD CONSTRAINT "LesseeRequirement_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
