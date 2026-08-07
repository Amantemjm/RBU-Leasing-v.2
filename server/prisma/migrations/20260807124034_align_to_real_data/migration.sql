/*
  Warnings:

  - The `type` column on the `Unit` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "advanceRent" TEXT,
ADD COLUMN     "managedBy" TEXT,
ADD COLUMN     "modeOfPayment" TEXT,
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "renewalPeriod" TEXT,
ADD COLUMN     "securityDeposit" TEXT,
ADD COLUMN     "serviceFee" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN     "slotNo" TEXT,
DROP COLUMN "type",
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'OTHER';

-- DropEnum
DROP TYPE "UnitType";
