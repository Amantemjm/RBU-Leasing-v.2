-- CreateEnum
CREATE TYPE "InfoSheetStatus" AS ENUM ('REQUESTED', 'SUBMITTED', 'APPROVED', 'RETURNED');

-- CreateTable
CREATE TABLE "UnitOwnerInfoSheet" (
    "id" TEXT NOT NULL,
    "unitOwnerId" TEXT NOT NULL,
    "status" "InfoSheetStatus" NOT NULL DEFAULT 'REQUESTED',
    "fullName" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "telephone" TEXT,
    "mailingAddress" TEXT,
    "nationality" TEXT,
    "civilStatus" TEXT,
    "tin" TEXT,
    "governmentIdType" TEXT,
    "governmentIdNumber" TEXT,
    "birthdate" TIMESTAMP(3),
    "spouseName" TEXT,
    "repName" TEXT,
    "repContact" TEXT,
    "repEmail" TEXT,
    "bankName" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "bankBranch" TEXT,
    "remarks" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitOwnerInfoSheet_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UnitOwnerInfoSheet" ADD CONSTRAINT "UnitOwnerInfoSheet_unitOwnerId_fkey" FOREIGN KEY ("unitOwnerId") REFERENCES "UnitOwner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
