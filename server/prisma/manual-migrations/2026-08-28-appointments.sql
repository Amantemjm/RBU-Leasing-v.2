CREATE TABLE IF NOT EXISTS "Appointment" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Scheduled',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "location" TEXT,
  "notes" TEXT,
  "outcome" TEXT,
  "reason" TEXT,
  "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_transactionId_stage_key" ON "Appointment"("transactionId", "stage");
CREATE INDEX IF NOT EXISTS "Appointment_transactionId_idx" ON "Appointment"("transactionId");
DO $$ BEGIN
  ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "LeasingTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
