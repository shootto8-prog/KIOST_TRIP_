-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "purpose" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TripStop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "location" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "TripStop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "transportMode" TEXT,
    "imagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Receipt_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TripStop_tripId_idx" ON "TripStop"("tripId");

-- CreateIndex
CREATE INDEX "Receipt_tripId_category_idx" ON "Receipt"("tripId", "category");
