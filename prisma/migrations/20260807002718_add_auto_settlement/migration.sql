-- AlterEnum
ALTER TYPE "VerdictStatus" ADD VALUE 'SUBMITTED';

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "autoSettlement" BOOLEAN NOT NULL DEFAULT true;
