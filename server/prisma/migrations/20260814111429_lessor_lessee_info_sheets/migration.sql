/*
  Warnings:

  - You are about to drop the `UnitOwnerInfoSheet` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UnitOwnerInfoSheet" DROP CONSTRAINT "UnitOwnerInfoSheet_unitOwnerId_fkey";

-- DropTable
DROP TABLE "UnitOwnerInfoSheet";

-- CreateTable
CREATE TABLE "LessorInfoSheet" (
    "id" TEXT NOT NULL,
    "unitOwnerId" TEXT NOT NULL,
    "status" "InfoSheetStatus" NOT NULL DEFAULT 'REQUESTED',
    "data" JSONB NOT NULL DEFAULT '{}',
    "remarks" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessorInfoSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LesseeInfoSheet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "InfoSheetStatus" NOT NULL DEFAULT 'REQUESTED',
    "data" JSONB NOT NULL DEFAULT '{}',
    "remarks" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LesseeInfoSheet_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LessorInfoSheet" ADD CONSTRAINT "LessorInfoSheet_unitOwnerId_fkey" FOREIGN KEY ("unitOwnerId") REFERENCES "UnitOwner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LesseeInfoSheet" ADD CONSTRAINT "LesseeInfoSheet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
