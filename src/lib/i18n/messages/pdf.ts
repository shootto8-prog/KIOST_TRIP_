import type { Locale } from "../locale";
import ko from "../dictionaries/ko";
import en from "../dictionaries/en";

function dict(locale: Locale) {
  return locale === "ko" ? ko : en;
}

/** "교통 세부내역 (3건)" / "Transport Details (3 items)". */
export function categoryDetailHeading(locale: Locale, categoryLabel: string, count: number): string {
  if (locale === "ko") return `${categoryLabel} 세부내역 (${count}건)`;
  return `${categoryLabel} Details (${count} ${count === 1 ? "item" : "items"})`;
}

/** "현장사진 (3건)" / "Field Photos (3 items)". */
export function fieldPhotoHeading(locale: Locale, count: number): string {
  const t = dict(locale);
  if (locale === "ko") return `${t.pdf.categoryLabels.field} (${count}건)`;
  return `${t.pdf.categoryLabels.field} (${count} ${count === 1 ? "item" : "items"})`;
}

/** "N건"/"N" - PDF 표의 건수 칸. 영어는 헤더("Count")가 이미 의미를 알려주므로 접미사 없이 숫자만. */
export function countOrDash(locale: Locale, count: number): string {
  if (count <= 0) return "-";
  const t = dict(locale);
  return `${count}${t.pdf.countUnit}`;
}
