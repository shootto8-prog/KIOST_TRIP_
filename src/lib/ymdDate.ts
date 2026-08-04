/**
 * "YYYY-MM-DD" 문자열을 달력상 실제로 존재하는 날짜인지까지 확인해서 Date로 바꾼다.
 *
 * 예전에는 형식(자릿수)만 보고 `new Date("2026-13-01")`을 그대로 Prisma에 넘겨,
 * Invalid Date로 쿼리가 던져지며 사용자에게는 원인 없는 500이 나갔다.
 * 월 1~12, 일은 그 달의 실제 일수 범위까지 확인하고, 어긋나면 null을 돌려준다.
 */
export function parseYmd(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2999) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  // 날짜만 있는 값은 항상 UTC 자정으로 고정한다 (실행 환경 타임존과 무관하게 같은 달력 날짜).
  return new Date(Date.UTC(year, month - 1, day));
}

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 년/월/일이 각각 달력상 유효한 조합인지 (프론트 입력 컴포넌트용). */
export function isValidYmdParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1900 || year > 2999) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

export const INVALID_DATE_MESSAGE = "날짜를 확인해 주세요. 실제로 있는 날짜만 입력할 수 있습니다.";
