import type { LocalReceipt, Category, VerdictStatus } from "./localDb";

export const CATEGORIES = ["BREAKFAST", "TRANSPORT", "LODGING", "FIELD"] as const;

/** sumAcceptedLodging은 LocalReceipt 전체가 아니라 이 4개 필드만 쓴다 - ReceiptManager처럼
 * ReceiptItem(로컬 저장소의 tripId 등을 빼고 화면에 필요한 필드만 남긴 타입)을 들고 있는
 * 호출부도 그대로 넘길 수 있게 구조적으로 좁혀둔다. */
type LodgingCheckable = { id: string; category: Category; verdictStatus: VerdictStatus; verdictAmount: number | null };

/**
 * src/lib/tripSummary.ts(getTripWithSummary)가 하던 Prisma aggregate를 인메모리 reduce로
 * 대체한 것 - 한 출장의 영수증은 많아야 수십 건이라 서버 집계 없이 그냥 다 훑어도 충분하다.
 */
export function summarizeByCategory(receipts: LocalReceipt[]): {
  byCategory: Record<Category, LocalReceipt[]>;
  sumByCategory: Record<Category, number>;
  totalAmount: number;
} {
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, receipts.filter((r) => r.category === c)])
  ) as Record<Category, LocalReceipt[]>;
  const sumByCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, byCategory[c].reduce((s, r) => s + (r.verdictAmount ?? 0), 0)])
  ) as Record<Category, number>;
  // 현장사진(FIELD)은 판정 대상이 아니라 verdictAmount가 항상 null이라 총합에는 포함하지 않는다.
  const totalAmount = sumByCategory.BREAKFAST + sumByCategory.TRANSPORT + sumByCategory.LODGING;
  return { byCategory, sumByCategory, totalAmount };
}

/**
 * src/lib/lodgingBudget.ts(sumAcceptedLodgingInTrip)의 로직 이식 - 같은 출장의 다른 숙박
 * 영수증들이 이미 인정받은(APPROVED/PARTIAL) 금액 합계. excludeReceiptId는 재분석 시
 * 자기 자신을 이중으로 빼지 않기 위한 것(원본과 동일한 이유).
 */
export function sumAcceptedLodging(receipts: LodgingCheckable[], excludeReceiptId?: string): number {
  return receipts
    .filter((r) => r.category === "LODGING")
    .filter((r) => r.verdictStatus === "APPROVED" || r.verdictStatus === "PARTIAL")
    .filter((r) => r.id !== excludeReceiptId)
    .reduce((s, r) => s + (r.verdictAmount ?? 0), 0);
}
