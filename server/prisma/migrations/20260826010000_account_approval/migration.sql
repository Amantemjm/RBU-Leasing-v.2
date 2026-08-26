-- Portal self-signups now need approval by an ADMIN or LEASING_OFFICER.
CREATE TYPE "AccountStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Default APPROVED so every account that already exists stays usable; without
-- this, adding the gate would lock out the entire system on deploy.
ALTER TABLE "User" ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "User" ADD COLUMN "contactEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "User" ADD COLUMN "approvedByName" TEXT;
ALTER TABLE "User" ADD COLUMN "decidedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "rejectionReason" TEXT;

-- Pending accounts are read as a queue, so index the column that filters it.
CREATE INDEX "User_status_idx" ON "User"("status");
