import { describe, it, expect } from "vitest";
import { summarizeByCategory, sumAcceptedLodging } from "./tripSummaryLocal";
import type { LocalReceipt } from "./localDb";

function receipt(overrides: Partial<LocalReceipt>): LocalReceipt {
  return {
    id: overrides.id ?? "r1",
    tripId: "t1",
    category: "BREAKFAST",
    transportMode: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    images: [],
    ocrStatus: "PENDING",
    ocrText: null,
    ocrAmountGuess: null,
    ocrDateGuess: null,
    ocrMerchantGuess: null,
    ocrModel: null,
    verdictStatus: "APPROVED",
    verdictAmount: null,
    verdictMessage: null,
    verdictFailedCheck: null,
    verdictRegulationRef: null,
    ...overrides,
  };
}

describe("summarizeByCategory", () => {
  it("카테고리별로 건수/금액을 정확히 나눈다", () => {
    const receipts = [
      receipt({ id: "1", category: "BREAKFAST", verdictAmount: 8000 }),
      receipt({ id: "2", category: "BREAKFAST", verdictAmount: 12000 }),
      receipt({ id: "3", category: "TRANSPORT", verdictAmount: 45000 }),
      receipt({ id: "4", category: "LODGING", verdictAmount: 100000 }),
      receipt({ id: "5", category: "FIELD", verdictAmount: null }),
    ];
    const { byCategory, sumByCategory, totalAmount } = summarizeByCategory(receipts);
    expect(byCategory.BREAKFAST).toHaveLength(2);
    expect(sumByCategory.BREAKFAST).toBe(20000);
    expect(sumByCategory.TRANSPORT).toBe(45000);
    expect(sumByCategory.LODGING).toBe(100000);
    expect(sumByCategory.FIELD).toBe(0);
    expect(totalAmount).toBe(20000 + 45000 + 100000);
  });

  it("영수증이 없으면 전부 0이다", () => {
    const { sumByCategory, totalAmount } = summarizeByCategory([]);
    expect(sumByCategory.BREAKFAST).toBe(0);
    expect(totalAmount).toBe(0);
  });
});

describe("sumAcceptedLodging", () => {
  it("APPROVED/PARTIAL 숙박만 합산하고 REJECTED는 제외한다", () => {
    const receipts = [
      receipt({ id: "1", category: "LODGING", verdictStatus: "APPROVED", verdictAmount: 100000 }),
      receipt({ id: "2", category: "LODGING", verdictStatus: "PARTIAL", verdictAmount: 40000 }),
      receipt({ id: "3", category: "LODGING", verdictStatus: "REJECTED", verdictAmount: null }),
      receipt({ id: "4", category: "BREAKFAST", verdictStatus: "APPROVED", verdictAmount: 8000 }),
    ];
    expect(sumAcceptedLodging(receipts)).toBe(140000);
  });

  it("excludeReceiptId로 지정한 영수증 자신은 합계에서 뺀다(재분석 시 이중 차감 방지)", () => {
    const receipts = [
      receipt({ id: "1", category: "LODGING", verdictStatus: "APPROVED", verdictAmount: 100000 }),
      receipt({ id: "2", category: "LODGING", verdictStatus: "APPROVED", verdictAmount: 50000 }),
    ];
    expect(sumAcceptedLodging(receipts, "2")).toBe(100000);
  });
});
