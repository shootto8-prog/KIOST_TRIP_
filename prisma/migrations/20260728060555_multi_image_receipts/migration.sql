-- 영수증 한 건에 사진을 여러 장(왕복 항공권 등) 첨부할 수 있도록 Receipt.imagePath(단일)를
-- ReceiptImage(다대일) 관계로 옮긴다. 좌석등급(seatClass)도 함께 추가.
-- ReceiptCategory에 FIELD, TransportMode에 RAIL/PRIVATE_CAR/BUS가 늘었지만 SQLite에는 TEXT로만
-- 저장되어 있어(Prisma가 애플리케이션 레벨에서 enum을 강제) 별도 컬럼 변경이 필요 없다.

-- 1) ReceiptImage 테이블 생성
CREATE TABLE "ReceiptImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiptId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "ReceiptImage_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ReceiptImage_receiptId_idx" ON "ReceiptImage"("receiptId");

-- 2) 기존 Receipt.imagePath 값을 ReceiptImage로 이관 (기존 실사용 데이터 보존)
INSERT INTO "ReceiptImage" ("id", "receiptId", "path", "order")
SELECT lower(hex(randomblob(16))), "id", "imagePath", 0 FROM "Receipt";

-- 3) Receipt 재정의: imagePath 제거, seatClass 추가
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "transportMode" TEXT,
    "seatClass" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ocrStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ocrText" TEXT,
    "ocrAmountGuess" INTEGER,
    "ocrDateGuess" DATETIME,
    "ocrMerchantGuess" TEXT,
    "ocrModel" TEXT,
    "verdictStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "verdictAmount" INTEGER,
    "verdictMessage" TEXT,
    "verdictFailedCheck" TEXT,
    "verdictRegulationRef" TEXT,
    CONSTRAINT "Receipt_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Receipt" (
    "id", "tripId", "category", "transportMode", "createdAt",
    "ocrStatus", "ocrText", "ocrAmountGuess", "ocrDateGuess", "ocrMerchantGuess", "ocrModel",
    "verdictStatus", "verdictAmount", "verdictMessage", "verdictFailedCheck", "verdictRegulationRef"
)
SELECT
    "id", "tripId", "category", "transportMode", "createdAt",
    "ocrStatus", "ocrText", "ocrAmountGuess", "ocrDateGuess", "ocrMerchantGuess", "ocrModel",
    "verdictStatus", "verdictAmount", "verdictMessage", "verdictFailedCheck", "verdictRegulationRef"
FROM "Receipt";
DROP TABLE "Receipt";
ALTER TABLE "new_Receipt" RENAME TO "Receipt";
CREATE INDEX "Receipt_tripId_category_idx" ON "Receipt"("tripId", "category");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
