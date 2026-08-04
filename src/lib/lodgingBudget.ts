import { prisma } from "./prisma";

/**
 * 같은 출장의 숙박 영수증들이 이미 인정받은 금액의 합계를 구한다.
 *
 * 숙박 상한은 "출장 전체" 기준(1박 상한 × 박수)인데, 예전에는 영수증마다 매번 그 전체 상한과만
 * 비교해서 20만원짜리 영수증 2장을 따로 올리면 2박 상한 24만원을 넘겨 40만원이 인정됐다.
 * 판정할 때마다 이 합계를 먼저 구해 "남은 한도"를 계산하면, 등록 순서나 재분석 시점과 무관하게
 * 항상 그 시점의 실제 합계를 기준으로 일관된 결과가 나온다.
 *
 * @param excludeReceiptId 재분석 중인 영수증 자신의 id. 반드시 제외해야 한다 - 안 그러면
 *   자기가 직전에 인정받은 금액이 자기 한도에서 다시 깎여, 재분석할 때마다 금액이 줄어든다.
 */
export async function sumAcceptedLodgingInTrip(
  tripId: string,
  excludeReceiptId?: string
): Promise<number> {
  const agg = await prisma.receipt.aggregate({
    where: {
      tripId,
      category: "LODGING",
      verdictStatus: { in: ["APPROVED", "PARTIAL"] },
      ...(excludeReceiptId ? { id: { not: excludeReceiptId } } : {}),
    },
    _sum: { verdictAmount: true },
  });
  return agg._sum.verdictAmount ?? 0;
}
