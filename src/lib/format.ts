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

export const VERDICT_LABEL: Record<string, string> = {
  PENDING: "판정 대기",
  APPROVED: "인정",
  PARTIAL: "부분인정",
  REJECTED: "불인정",
};

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
