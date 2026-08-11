import type { Locale } from "../locale";
import ko from "../dictionaries/ko";
import en from "../dictionaries/en";

/**
 * "3건 · 45,000원" / "3건 제출" 형태 - 한국어 조사(건/원)가 숫자에 바로 붙는 구조라 토큰
 * 치환으로는 영어가 안 나온다(단복수, 어순이 다름). locale별로 문장 전체를 조립한다.
 */
export function buildCategorySummary(
  locale: Locale,
  count: number,
  amount: number,
  autoSettlement: boolean
): string {
  const t = locale === "ko" ? ko : en;
  if (count === 0) return t.categoryCard.noReceipts;

  if (locale === "ko") {
    return autoSettlement ? `${count}건 · ${amount.toLocaleString("ko-KR")}원` : `${count}건 제출`;
  }
  const unit = count === 1 ? "receipt" : "receipts";
  return autoSettlement
    ? `${count} ${unit} · ${amount.toLocaleString("en-US")} KRW`
    : `${count} ${unit} submitted`;
}
