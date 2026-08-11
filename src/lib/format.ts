import { isFlatRateTransportMode } from "./verifyReceipt";
import type { Locale } from "./i18n/locale";

// 보는 사람의 기기 타임존과 무관하게 항상 한국 시각으로 표시한다 - timeZone을 명시하지 않으면
// 브라우저/서버 로컬 타임존을 따라가버려서, Vercel(UTC) SSR과 한국 브라우저에서 다르게 보이거나
// 해외에서 접속하면 실제와 다른 시각으로 보이는 문제가 있다.
const KST = "Asia/Seoul";

/** locale 인자는 트레일링 옵션(기본값 "ko")이라 기존 호출부는 안 건드려도 그대로 컴파일된다. */
export function formatDate(d: Date | string, locale: Locale = "ko"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatKrw(amount: number, locale: Locale = "ko"): string {
  return locale === "ko" ? `${amount.toLocaleString("ko-KR")}원` : `${amount.toLocaleString("en-US")} KRW`;
}

export function formatDateTime(d: Date | string, locale: Locale = "ko"): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 자동정산 사용 출장에서만 쓰는 라벨 - "인정/불인정"은 실제로 자동 판정이 이뤄졌을 때만
 * 맞는 표현이다. 자동정산 미사용 출장은 verdictDisplayLabel()을 대신 쓴다.
 * 기존 호출부(ko 전용 인덱싱)와의 호환을 위해 한국어 Record를 그대로 export 유지 - 새로
 * locale을 반영해야 하는 곳은 verdictLabel() 함수를 쓴다. */
export const VERDICT_LABEL: Record<string, string> = {
  PENDING: "판정 대기",
  APPROVED: "인정",
  PARTIAL: "부분인정",
  REJECTED: "불인정",
  SUBMITTED: "제출",
};

const VERDICT_LABEL_EN: Record<string, string> = {
  PENDING: "Pending Review",
  APPROVED: "Approved",
  PARTIAL: "Partially Approved",
  REJECTED: "Rejected",
  SUBMITTED: "Submitted",
};

export function verdictLabel(status: string, locale: Locale = "ko"): string {
  const dict = locale === "ko" ? VERDICT_LABEL : VERDICT_LABEL_EN;
  return dict[status] ?? status;
}

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
  transportMode?: string | null,
  locale: Locale = "ko"
): string {
  if (autoSettlement) return verdictLabel(status, locale);
  if (!isManuallyReviewedCategory(category, transportMode)) return locale === "ko" ? "제출" : "Submitted";
  if (status === "APPROVED") return locale === "ko" ? "확인" : "Confirmed";
  if (status === "PARTIAL" || status === "REJECTED") return locale === "ko" ? "확인요청" : "Needs Review";
  return locale === "ko" ? "제출" : "Submitted"; // SUBMITTED 등 방어적 폴백(필수 입력값이 없어 판정 자체를 못 한 경우)
}

export const STOP_TYPE_LABEL: Record<string, string> = {
  DEPARTURE: "출발지",
  STOPOVER: "경유지",
  ARRIVAL: "목적지",
};

const STOP_TYPE_LABEL_EN: Record<string, string> = {
  DEPARTURE: "Departure",
  STOPOVER: "Stopover",
  ARRIVAL: "Destination",
};

export function stopTypeLabel(type: string, locale: Locale = "ko"): string {
  const dict = locale === "ko" ? STOP_TYPE_LABEL : STOP_TYPE_LABEL_EN;
  return dict[type] ?? type;
}

export const CATEGORY_LABEL: Record<string, string> = {
  BREAKFAST: "조식",
  TRANSPORT: "교통",
  LODGING: "숙박",
  FIELD: "현장사진",
};

const CATEGORY_LABEL_EN: Record<string, string> = {
  BREAKFAST: "Breakfast",
  TRANSPORT: "Transport",
  LODGING: "Lodging",
  FIELD: "Field Photos",
};

export function categoryLabel(category: string, locale: Locale = "ko"): string {
  const dict = locale === "ko" ? CATEGORY_LABEL : CATEGORY_LABEL_EN;
  return dict[category] ?? category;
}

export const TRANSPORT_MODE_LABEL: Record<string, string> = {
  SHIP: "선박",
  AIR: "항공",
  RAIL: "고속철도",
  PRIVATE_CAR: "승용(렌트,동승)",
  BUS: "버스",
};

const TRANSPORT_MODE_LABEL_EN: Record<string, string> = {
  SHIP: "Ship",
  AIR: "Air",
  RAIL: "High-speed Rail",
  PRIVATE_CAR: "Private Car (rental/carpool)",
  BUS: "Bus",
};

export function transportModeLabel(mode: string, locale: Locale = "ko"): string {
  const dict = locale === "ko" ? TRANSPORT_MODE_LABEL : TRANSPORT_MODE_LABEL_EN;
  return dict[mode] ?? mode;
}
