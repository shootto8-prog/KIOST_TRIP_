import { prisma } from "./prisma";

const CATEGORIES = ["BREAKFAST", "TRANSPORT", "LODGING", "FIELD"] as const;
type Category = (typeof CATEGORIES)[number];

/**
 * PDF/이메일이 공통으로 쓰는 출장 정산 요약(카테고리별 건수/합계)을 한 곳에서 계산한다.
 * 현장사진(FIELD)은 판정 대상이 아니라 verdictAmount가 항상 null이라 총합에는 포함하지 않는다.
 */
export async function getTripWithSummary(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      stops: { orderBy: { order: "asc" } },
      receipts: { orderBy: { createdAt: "asc" }, include: { images: { orderBy: { order: "asc" } } } },
    },
  });
  if (!trip) return null;

  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, trip.receipts.filter((r) => r.category === c)])
  ) as Record<Category, typeof trip.receipts>;
  const sumByCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, byCategory[c].reduce((s, r) => s + (r.verdictAmount ?? 0), 0)])
  ) as Record<Category, number>;
  const totalAmount = sumByCategory.BREAKFAST + sumByCategory.TRANSPORT + sumByCategory.LODGING;

  return { trip, byCategory, sumByCategory, totalAmount };
}

export { CATEGORIES };
export type { Category };
