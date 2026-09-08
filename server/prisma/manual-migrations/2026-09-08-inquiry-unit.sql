-- Optional link from an inquiry to the specific unit the lessee is inquiring
-- about. Additive and idempotent, in line with the other manual migrations here
-- — the committed Prisma history has drifted on the deployed databases.
ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "unitId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
