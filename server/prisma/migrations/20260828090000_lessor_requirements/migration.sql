CREATE TABLE "LessorRequirement" (
  "id" TEXT NOT NULL,
  "unitOwnerId" TEXT NOT NULL,
  "requirementKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Required',
  "filename" TEXT,
  "mimeType" TEXT,
  "size" INTEGER,
  "data" BYTEA,
  "remarks" TEXT,
  "expiresAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewedByName" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessorRequirement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LessorRequirement_unitOwnerId_requirementKey_key" ON "LessorRequirement"("unitOwnerId", "requirementKey");
ALTER TABLE "LessorRequirement" ADD CONSTRAINT "LessorRequirement_unitOwnerId_fkey" FOREIGN KEY ("unitOwnerId") REFERENCES "UnitOwner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
