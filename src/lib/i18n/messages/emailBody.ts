import type { Locale } from "../locale";
import ko from "../dictionaries/ko";
import en from "../dictionaries/en";
import { formatDate, categoryLabel } from "../../format";
import { countAndAmount, buildTransportCell, amountOrDash } from "../../settlementFormat";
import type { LocalTrip } from "../../localDb";

function dict(locale: Locale) {
  return locale === "ko" ? ko : en;
}

/** "${email}로 보냈습니다." / "Sent to ${email}." - 어순이 달라 토큰 치환이 아니라 분기. */
export function buildSentMessage(locale: Locale, email: string): string {
  return locale === "ko" ? `${email}로 보냈습니다.` : `Sent to ${email}.`;
}

/** "[정총무]국내여비 증빙서류 내역서 (2026.08.01 ~ 2026.08.03)" 형태의 메일 제목. */
export function buildEmailSubject(locale: Locale, trip: Pick<LocalTrip, "startDate" | "endDate">): string {
  const t = dict(locale);
  return `${t.emailSendButton.subjectPrefix} (${formatDate(trip.startDate, locale)} ~ ${formatDate(trip.endDate, locale)})`;
}

type CategoryTotals = {
  byCategory: { BREAKFAST: unknown[]; TRANSPORT: unknown[]; LODGING: unknown[]; FIELD: unknown[] };
  sumByCategory: { BREAKFAST: number; TRANSPORT: number; LODGING: number; FIELD: number };
};

/**
 * 간편모드 메일 본문 - PDF의 "항목별 합계"(simpleSummaryTable)와 같은 데이터를 써서 첨부 PDF와
 * 본문 숫자가 어긋나지 않게 한다(원본 로직 그대로, locale만 추가).
 */
export function buildSimpleModeBodyLines(locale: Locale, data: CategoryTotals): string[] {
  const t = dict(locale);
  const summaryLine = (label: string, count: number, amount: number) => {
    const amt = amountOrDash(amount);
    const countPart = count > 0 ? (locale === "ko" ? `${count}건` : `${count}`) : "-";
    if (locale === "ko") return `${label}   ${countPart}   ${amt === "-" ? "-" : `${amt}원`}`;
    return `${label}   ${countPart}   ${amt === "-" ? "-" : `${amt} KRW`}`;
  };
  const fieldCount = data.byCategory.FIELD.length;
  const fieldCountText = fieldCount > 0 ? (locale === "ko" ? `${fieldCount}건` : `${fieldCount}`) : "-";
  return [
    t.emailSendButton.attachmentIntroSimple,
    "",
    summaryLine(categoryLabel("BREAKFAST", locale), data.byCategory.BREAKFAST.length, data.sumByCategory.BREAKFAST),
    summaryLine(categoryLabel("TRANSPORT", locale), data.byCategory.TRANSPORT.length, data.sumByCategory.TRANSPORT),
    summaryLine(categoryLabel("LODGING", locale), data.byCategory.LODGING.length, data.sumByCategory.LODGING),
    `${categoryLabel("FIELD", locale)}   ${fieldCountText}`,
  ];
}

type TransportItem = { transportMode: string | null; verdictAmount: number | null };

/**
 * 상세모드 메일 본문 - PDF의 표시 규칙(countAndAmount/buildTransportCell)을 그대로 써서 첨부
 * PDF와 서로 다른 값이 찍히지 않게 한다(원본 로직 그대로, locale만 추가).
 */
export function buildDetailedModeBodyLines(
  locale: Locale,
  trip: Pick<LocalTrip, "autoSettlement">,
  data: CategoryTotals & { transportItems: TransportItem[] },
  totalAmount: number
): string[] {
  const t = dict(locale);
  const krwSuffix = locale === "ko" ? "원" : " KRW";
  return [
    trip.autoSettlement ? t.emailSendButton.attachmentIntroAuto : t.emailSendButton.attachmentIntroManual,
    "",
    trip.autoSettlement
      ? `${categoryLabel("BREAKFAST", locale)}   ${data.byCategory.BREAKFAST.length}${locale === "ko" ? "건" : ""}   ${data.sumByCategory.BREAKFAST.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}${krwSuffix}`
      : `${categoryLabel("BREAKFAST", locale)}   ${countAndAmount(data.byCategory.BREAKFAST.length, data.sumByCategory.BREAKFAST, locale)}`,
    `${categoryLabel("TRANSPORT", locale)}   ${buildTransportCell(data.transportItems, trip.autoSettlement, locale)}`,
    trip.autoSettlement
      ? `${categoryLabel("LODGING", locale)}   ${data.byCategory.LODGING.length}${locale === "ko" ? "건" : ""}   ${data.sumByCategory.LODGING.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}${krwSuffix}`
      : `${categoryLabel("LODGING", locale)}   ${countAndAmount(data.byCategory.LODGING.length, data.sumByCategory.LODGING, locale)}`,
    `${categoryLabel("FIELD", locale)}   ${data.byCategory.FIELD.length}${locale === "ko" ? "건" : ""}`,
    ...(trip.autoSettlement
      ? [`${t.emailSendButton.grandTotalLabel}   ${totalAmount.toLocaleString(locale === "ko" ? "ko-KR" : "en-US")}${krwSuffix}`]
      : []),
  ];
}
