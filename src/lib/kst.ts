/**
 * 영수증 OCR로 뽑아낸 일시 문자열(예: "2026-07-13 09:05:58")은 타임존 표시가 없지만
 * 항상 한국 현지시각(KST, UTC+9)이다 - 전부 국내 영수증이라서. 이 문자열을 그냥
 * `new Date(...)`로 바꾸면, 실행 환경의 로컬 타임존을 기준으로 해석돼버린다: 로컬
 * 개발 환경(이 한국 컴퓨터)에서는 우연히 KST라 맞았지만, Vercel 서버는 UTC로 돌아가서
 * "09:05:58"을 UTC로 착각해 실제보다 9시간 늦은 시각으로 저장/표시되는 버그가 있었다.
 *
 * 이 파일의 함수들은 실행 환경의 타임존과 무관하게 항상 "한국 시각 기준"으로 해석/추출한다.
 */

const KST_TIME_ZONE = "Asia/Seoul";

/** "YYYY-MM-DD HH:MM:SS" 또는 "YYYY-MM-DDTHH:MM:SS" 형태(타임존 없음)를 한국 현지시각으로 해석한다. */
export function parseKstDatetime(raw: string): Date | null {
  const normalized = raw.trim().replace(" ", "T");
  const withOffset = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}+09:00`;
  const d = new Date(withOffset);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type KstParts = {
  year: number;
  month: number; // 0-indexed (Date.getMonth()과 동일한 규칙)
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** 실행 환경의 로컬 타임존과 무관하게, 어떤 Date 값을 한국 달력/시계 기준 구성요소로 뽑아낸다. */
export function getKstParts(date: Date): KstParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month) - 1,
    day: Number(parts.day),
    hour: Number(parts.hour) % 24, // hourCycle h23이 자정을 "24"로 줄 때가 있어 보정
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}