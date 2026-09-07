-- Named document slots on a transaction: the Letter of Intent that gates entry
-- to Contract Signing, and the signed contract that closes it. Additive and
-- idempotent, in line with the other manual migrations here — the committed
-- Prisma history has drifted on the deployed databases.
--
-- NULL docType means a loose supporting attachment. Postgres treats NULLs as
-- distinct in a unique index, so a transaction may hold any number of those
-- while holding at most one of each named type.
ALTER TABLE "TransactionDocument" ADD COLUMN IF NOT EXISTS "docType" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TransactionDocument_transactionId_docType_key"
  ON "TransactionDocument" ("transactionId", "docType");
