import { TRANSPORT_MODE_LABEL, formatKrw } from "./format";
import { FLAT_RATE_TRANSPORT_MODES } from "./verifyReceipt";

/**
 * 금액이 있으면 숫자만(사내 업무망 표기에 맞춰 "원" 없이), 없으면(0원) "-"로 표기한다.
 * PDF "국내여비 증빙서류 내역서"의 항목별 합계 전용 - 화면/이메일 등 다른 곳은 formatKrw를
 * 그대로 쓴다(2026-08-10, 사용자 요청: PDF에서는 원 단위 표기를 전부 뺄 것).
 */
export function amountOrDash(amount: number): string {
  return amount > 0 ? amount.toLocaleString("ko-KR") : "-";
}

export function countOrDash(count: number, suffix: string): string {
  return count > 0 ? `${count}${suffix}` : "-";
}

/**
 * 자동정산 미사용 출장의 조식/숙박/교통(선박·항공)은 담당자가 실제 신청 건수·금액을 한눈에
 * 봐야 하므로 PDF/이메일에 "N건 제출, 확인금액 000원"으로 함께 보여준다(2026-08-07). 여기 금액은
 * 사용자가 처음 입력한 원금액이 아니라, 시간대/상한 등 구조적 규칙을 통과(또는 상한 적용)한
 * "확인금액"이다 - 예를 들어 조식 3건 중 1건이 시간대 규정 위반으로 반려되면 그 건은 빠진
 * 금액만 합산된다. "확인금액"이라는 표현으로 이 값이 신청 원금액과 다를 수 있음을 명시한다
 * (2026-08-07 안정성 재검토 - 라벨이 신청액처럼 보인다는 지적 반영, 원금액까지 보여주려면
 * DB에 별도 컬럼이 필요해 이번엔 라벨 명시로 대응).
 */
export function countAndAmount(count: number, amount: number): string {
  if (count === 0) return "-";
  return amount > 0 ? `${count}건 제출, 확인금액 ${formatKrw(amount)}` : `${count}건 제출`;
}

export type TransportSummaryItem = { transportMode: string | null; verdictAmount: number | null };

/**
 * 교통 항목의 "내용" 칸: 항공/선박은 (자동정산이든 사용자 직접입력이든) 금액을 보여준다.
 * 고속철도/승용/버스는 정액정산 대상이지만, TRANS 요금표 구간 선택으로 금액이 정해지므로
 * (2026-08-10) 이제 그 금액도 함께 합산해서 보여주고, 어떤 교통수단을 썼는지는 태그로 덧붙인다
 * (예: "3건 제출, 확인금액 45,000원, 고속철도"). 자동정산 미사용 출장의 선박/항공은 건수도
 * 함께 보여준다(2026-08-07 - 사용자 입력값이 PDF에 안 보인다는 실사용 피드백 반영).
 */
export function buildTransportCell(items: TransportSummaryItem[], autoSettlement: boolean): string {
  if (items.length === 0) return "-";
  const flatModes = new Set<string>(FLAT_RATE_TRANSPORT_MODES);
  const flatItems = items.filter((r) => r.transportMode && flatModes.has(r.transportMode));
  const nonFlatItems = items.filter((r) => r.transportMode === "AIR" || r.transportMode === "SHIP");
  const amountSum = items.reduce((s, r) => s + (r.verdictAmount ?? 0), 0);
  const flatModesUsed = Array.from(new Set(flatItems.map((r) => r.transportMode as string)));

  const parts: string[] = [];
  if (autoSettlement) {
    if (amountSum > 0) parts.push(formatKrw(amountSum));
  } else if (nonFlatItems.length > 0 || flatItems.length > 0) {
    parts.push(countAndAmount(items.length, amountSum));
  }
  for (const m of flatModesUsed) parts.push(TRANSPORT_MODE_LABEL[m] ?? m);
  if (parts.length > 0) return parts.join(", ");
  // 교통수단이 없는(이론상 구버전) 영수증이 섞이면 위 분류에 하나도 안 걸려 등록된 건이
  // 있는데도 "-"로 조용히 안 보일 수 있었다 - 최소한 건수는 남긴다. (2026-08-07 안정성 재검토)
  return `${items.length}건 제출`;
}

/**
 * 출장 시작일~종료일의 총 일수(당일 출장=1일, 1박2일=2일 ...). 조식 정산(안) 산식의 "N일"에 쓴다.
 * analyzeReceipt.ts의 tripNights()와 같은 계산이지만, 그 파일은 서버 전용 의존성(OCR 호출 등)을
 * 갖고 있어 클라이언트 번들에 잘못 딸려오는 걸 피하려고 이 순수 계산만 여기 따로 둔다.
 */
export function tripTotalDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const nights = Math.max(0, Math.round((endDay - startDay) / 86400000));
  return nights + 1;
}

/** 조식 정산(안) 산식의 기준값(2026-08-10, 사용자 확정) - 1일 기본 조식비, 1일차(출장 당일)
 * 제외액. 사용자가 직접 선택하는 "식비공제(N식)"도 같은 단가(1식=15,000원)를 쓴다. */
export const BREAKFAST_DAILY_RATE = 45000;
export const BREAKFAST_FIRST_DAY_DEDUCTION = 15000;
export const BREAKFAST_MEAL_DEDUCTION_UNIT = 15000;

/** 조식 정산(안)의 최종 합계 금액(45,000×총 일수 - 15,000 - 식비공제(N식×15,000) + 앱 인정금액). */
export function computeBreakfastSettlementTotal(
  totalDays: number,
  appAcceptedAmount: number,
  mealDeductionCount = 0
): number {
  return (
    BREAKFAST_DAILY_RATE * totalDays -
    BREAKFAST_FIRST_DAY_DEDUCTION -
    mealDeductionCount * BREAKFAST_MEAL_DEDUCTION_UNIT +
    appAcceptedAmount
  );
}

/**
 * 조식 정산(안) - PDF의 "정산(안)" 칸에 그대로 붙여넣기 쉽도록 산식 형태 문자열로 보여준다.
 * 출장 1일차는 조식비 지급 대상이 아니므로(출발 전 이미 식사한 것으로 봄), 기본액(45,000×
 * 총 일수)에서 1일차 몫(15,000)을 빼고, 실제로 이 앱에 등록(인정)된 조식 영수증 금액을 더한다.
 * appAcceptedAmount는 sumByCategory.BREAKFAST(자동정산/수동입력 모두 verdictAmount 합계) 그대로 쓴다.
 *
 * mealDeductionCount(식비공제, 0보다 클 때만 항으로 추가)는 조식 화면에서 사용자가 직접
 * "N식 식비공제"로 선택한 값 - 이미 지급된 식사 등을 이유로 N식 × 15,000원을 추가로 뺀다
 * (2026-08-10, 사용자 요청).
 *
 * appAcceptedAmount가 0이면(조식비 정산 자체가 없으면) 마지막 "+ 0" 항은 아예 안 붙인다
 * (2026-08-10, 사용자 요청 - 붙일 게 없는데 "+0"이 남아있으면 사내망에 그대로 옮기기 어색하다).
 *
 * 표기(곱셈 기호 "*", 숫자 뒤 "원" 없음, 마지막 항에 설명 괄호 없음)는 사내 업무망 입력 산식
 * 표기를 그대로 옮긴 것이라 임의로 다듬지 않는다(2026-08-10, 사용자 확인).
 */
export function formatBreakfastSettlement(
  totalDays: number,
  appAcceptedAmount: number,
  mealDeductionCount = 0
): string {
  const base = BREAKFAST_DAILY_RATE * totalDays;
  const mealDeductionAmount = mealDeductionCount * BREAKFAST_MEAL_DEDUCTION_UNIT;
  return (
    `${base.toLocaleString("ko-KR")}*${totalDays}일 - ${BREAKFAST_FIRST_DAY_DEDUCTION.toLocaleString("ko-KR")}(1일차 조식비 제외)` +
    (mealDeductionCount > 0
      ? ` - ${mealDeductionAmount.toLocaleString("ko-KR")}(식비공제·${mealDeductionCount}식)`
      : "") +
    (appAcceptedAmount > 0 ? ` + ${appAcceptedAmount.toLocaleString("ko-KR")}` : "")
  );
}

/**
 * 교통비 정산(안) - 등록된 교통 영수증(항공/선박 인식금액 + 고속철도/승용/버스 구간 요금)을
 * "A + B + ..." 형태로 그대로 나열한다(사내 업무망 표기에 맞춰 원 단위 없이, 2026-08-10). 사내망에
 * 입력할 때 어떤 값들이 더해졌는지 그대로 보이도록, 미리 합산한 총액 하나로 뭉개지 않는다.
 */
export function formatTransportSettlement(amounts: number[]): string {
  if (amounts.length === 0) return "-";
  return amounts.map((a) => a.toLocaleString("ko-KR")).join(" + ");
}

/**
 * 숙박 "인트라넷 안내" 기준(2026-08-10, 사용자 확정) - 사내 시스템이 영수증 건별로 나누지 않고
 * "출장 전체 숙박 합계 ÷ 전체 박수"만 기계적으로 본다. 화면(ReceiptManager)과 PDF(비고란)가
 * 같은 기준을 써야 어긋나지 않으므로 여기 한 곳에만 둔다.
 */
export const LODGING_INTRANET_THRESHOLD_KRW = 80000;

export function exceedsLodgingIntranetThreshold(totalAcceptedAmount: number, tripNights: number): boolean {
  return totalAcceptedAmount / tripNights > LODGING_INTRANET_THRESHOLD_KRW;
}
