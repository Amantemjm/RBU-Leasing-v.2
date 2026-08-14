/*
  Warnings:

  - Added the required column `inquirerType` to the `Inquiry` table without a default value. This is not possible if the table is not empty.
  - Added the required column `inquiryType` to the `Inquiry` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InquirerType" AS ENUM ('LESSOR', 'LESSEE');

-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "inquirerType" "InquirerType" NOT NULL,
ADD COLUMN     "inquiryType" TEXT NOT NULL,
ALTER COLUMN "message" DROP NOT NULL;
