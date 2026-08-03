-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('DEPARTURE', 'STOPOVER', 'ARRIVAL');

-- CreateEnum
CREATE TYPE "ReceiptCategory" AS ENUM ('BREAKFAST', 'TRANSPORT', 'LODGING', 'FIELD');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('SHIP', 'AIR', 'RAIL', 'PRIVATE_CAR', 'BUS');

-- CreateEnum
CREATE TYPE "SeatClass" AS ENUM ('NORMAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "VerdictStatus" AS ENUM ('PENDING', 'APPROVED', 'PARTIAL', 'REJECTED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripStop" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "type" "StopType" NOT NULL,
    "location" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "TripStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "category" "ReceiptCategory" NOT NULL,
    "transportMode" "TransportMode",
    "seatClass" "SeatClass",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ocrStatus" "OcrStatus" NOT NULL DEFAULT 'PENDING',
    "ocrText" TEXT,
    "ocrAmountGuess" INTEGER,
    "ocrDateGuess" TIMESTAMP(3),
    "ocrMerchantGuess" TEXT,
    "ocrModel" TEXT,
    "verdictStatus" "VerdictStatus" NOT NULL DEFAULT 'PENDING',
    "verdictAmount" INTEGER,
    "verdictMessage" TEXT,
    "verdictFailedCheck" TEXT,
    "verdictRegulationRef" TEXT,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptImage" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ReceiptImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripStop_tripId_idx" ON "TripStop"("tripId");

-- CreateIndex
CREATE INDEX "Receipt_tripId_category_idx" ON "Receipt"("tripId", "category");

-- CreateIndex
CREATE INDEX "ReceiptImage_receiptId_idx" ON "ReceiptImage"("receiptId");

-- AddForeignKey
ALTER TABLE "TripStop" ADD CONSTRAINT "TripStop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptImage" ADD CONSTRAINT "ReceiptImage_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;