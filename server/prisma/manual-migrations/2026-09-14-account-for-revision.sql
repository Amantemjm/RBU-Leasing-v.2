-- A third decision on an application: neither accepted nor refused, but sent
-- back with remarks for the applicant to correct and resubmit. Additive and
-- idempotent, in line with the other manual migrations here — the committed
-- Prisma history has drifted on the deployed databases.
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that then
-- reads the new value, so this runs on its own. IF NOT EXISTS makes a second
-- run a no-op.
ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'FOR_REVISION';
