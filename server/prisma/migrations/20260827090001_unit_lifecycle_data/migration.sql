-- Rejection/approval remark shown to the lessor.
ALTER TABLE "Unit" ADD COLUMN "reviewRemarks" TEXT;
-- Retire PENDING: existing owner submissions become SUBMITTED. PENDING stays in
-- the enum type as an unused value (Postgres cannot drop an enum value cleanly);
-- application code never writes it again.
UPDATE "Unit" SET "approvalStatus" = 'SUBMITTED' WHERE "approvalStatus" = 'PENDING';
