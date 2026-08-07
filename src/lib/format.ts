import { isFlatRateTransportMode } from "./verifyReceipt";

// 보는 사람의 기기 타임존과 무관하게 항상 한국 시각으로 표시한다 - timeZone을 명시하지 않으면
// 브라우저/서버 로컬 타임존을 따라가버려서, Vercel(UTC) SSR과 한국 브라우저에서 다르게 보이거나
// 해외에서 접속하면 실제와 다른 시각으로 보이는 문제가 있다.
const KST = "Asia/Seoul";

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatKrw(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

export function formatDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 자동정산 사용 출장에서만 쓰는 라벨 - "인정/불인정"은 실제로 자동 판정이 이뤄졌을 때만
 * 맞는 표현이다. 자동정산 미사용 출장은 verdictDisplayLabel()을 대신 쓴다. */
export const VERDICT_LABEL: Record<string, string> = {
  PENDING: "판정 대기",
  APPROVED: "인정",
  PARTIAL: "부분인정",
  REJECTED: "불인정",
  SUBMITTED: "제출",
};

/**
 * 자동정산 미사용 출장에서, 이 항목이 r1 규정 기반 구조적 자동판정 대상인지 - 조식/교통(선박·
 * 항공)/숙박만 해당한다. 현장사진과 정액정산 교통수단(고속철도/승용/버스)은 애초에 판정할 게
 * 없어 항상 "제출"로만 표시한다.
 */
export function isManuallyReviewedCategory(
  category: string,
  transportMode?: string | null
): boolean {
  if (category === "FIELD") return false;
  if (category === "TRANSPORT" && transportMode && isFlatRateTransportMode(transportMode)) return false;
  return true;
}

/**
 * 자동정산 미사용 출장은 "인정/불인정"이라는 표현을 쓰지 않는다 - 최종 확정이 아니라 담당자가
 * 검토해야 한다는 원칙을 표현에도 반영한다. r1 규정으로 구조적 검토가 가능한 항목(조식/교통-
 * 선박·항공/숙박)은 문제 없으면 "확인", 문제가 있으면(반려/부분인정 모두) "확인요청"으로
 * 표시하고, 판정 자체가 없는 항목(현장사진, 정액정산 교통수단)은 항상 "제출"로 표시한다.
 * (2026-08-07)
 */
export function verdictDisplayLabel(
  status: string,
  autoSettlement: boolean,
  category: string,
  transportMode?: string | null
): string {
  if (autoSettlement) return VERDICT_LABEL[status] ?? status;
  if (!isManuallyReviewedCategory(category, transportMode)) return "제출";
  if (status === "APPROVED") return "확인";
  if (status === "PARTIAL" || status === "REJECTED") return "확인요청";
  return "제출"; // SUBMITTED 등 방어적 폴백(필수 입력값이 없어 판정 자체를 못 한 경우)
}

export const STOP_TYPE_LABEL: Record<string, string> = {
  DEPARTURE: "출발지",
  STOPOVER: "경유지",
  ARRIVAL: "목적지",
};

export const CATEGORY_LABEL: Record<string, string> = {
  BREAKFAST: "조식",
  TRANSPORT: "교통",
  LODGING: "숙박",
  FIELD: "현장사진",
};

export const TRANSPORT_MODE_LABEL: Record<string, string> = {
  SHIP: "선박",
  AIR: "항공",
  RAIL: "고속철도",
  PRIVATE_CAR: "승용(렌트,동승)",
  BUS: "버스",
};
