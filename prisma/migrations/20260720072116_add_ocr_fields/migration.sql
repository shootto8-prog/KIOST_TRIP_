-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "transportMode" TEXT,
    "imagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ocrStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ocrText" TEXT,
    "ocrAmountGuess" INTEGER,
    "ocrDateGuess" DATETIME,
    "ocrMerchantGuess" TEXT,
    CONSTRAINT "Receipt_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Receipt" ("category", "createdAt", "id", "imagePath", "transportMode", "tripId") SELECT "category", "createdAt", "id", "imagePath", "transportMode", "tripId" FROM "Receipt";
DROP TABLE "Receipt";
ALTER TABLE "new_Receipt" RENAME TO "Receipt";
CREATE INDEX "Receipt_tripId_category_idx" ON "Receipt"("tripId", "category");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
