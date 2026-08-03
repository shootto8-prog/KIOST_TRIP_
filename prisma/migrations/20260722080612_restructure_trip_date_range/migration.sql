-- 출장기간(startDate~endDate)을 Trip에 직접 두고, TripStop에서는 날짜 개념을 제거한다.
-- (경로상의 개별 지점은 더 이상 각자 날짜를 갖지 않고, 출장 전체 기간과 장소 목록으로만 관리한다)

-- 1) Trip에 nullable로 컬럼 추가 후 기존 TripStop 날짜로 백필
ALTER TABLE "Trip" ADD COLUMN "startDate" DATETIME;
ALTER TABLE "Trip" ADD COLUMN "endDate" DATETIME;

UPDATE "Trip"
SET "startDate" = (SELECT MIN("date") FROM "TripStop" WHERE "TripStop"."tripId" = "Trip"."id"),
    "endDate" = (SELECT MAX("date") FROM "TripStop" WHERE "TripStop"."tripId" = "Trip"."id");

-- 2) Trip 재정의: startDate/endDate를 NOT NULL로 확정
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Trip" ("id", "status", "startDate", "endDate", "createdAt", "updatedAt")
SELECT "id", "status", "startDate", "endDate", "createdAt", "updatedAt" FROM "Trip";
DROP TABLE "Trip";
ALTER TABLE "new_Trip" RENAME TO "Trip";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- 3) TripStop 재정의: date 컬럼 제거
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TripStop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "TripStop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TripStop" ("id", "tripId", "type", "location", "order")
SELECT "id", "tripId", "type", "location", "order" FROM "TripStop";
DROP TABLE "TripStop";
ALTER TABLE "new_TripStop" RENAME TO "TripStop";
CREATE INDEX "TripStop_tripId_idx" ON "TripStop"("tripId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
