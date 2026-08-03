-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Trip" ("createdAt", "id", "updatedAt") SELECT "createdAt", "id", "updatedAt" FROM "Trip";
DROP TABLE "Trip";
ALTER TABLE "new_Trip" RENAME TO "Trip";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
