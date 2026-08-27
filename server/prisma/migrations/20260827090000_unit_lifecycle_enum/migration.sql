-- New lifecycle values. Postgres cannot use a freshly-added value in the same
-- transaction, so the data update that references them lives in the next migration.
ALTER TYPE "UnitApprovalStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "UnitApprovalStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
