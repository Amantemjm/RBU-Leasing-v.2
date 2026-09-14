-- The unit a lessor describes while applying. It cannot be a Unit row yet:
-- Unit.ownerId is required and the UnitOwner is created only on approval, so
-- that the Owners list holds vetted parties only. approveAccount materialises
-- this into a DRAFT Unit inside the same transaction that creates the owner.
--
-- Additive and idempotent, in line with the other manual migrations here — the
-- committed Prisma history has drifted on the deployed databases.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingUnit" JSONB;
