import type { Locale } from "../locale";
import ko from "../dictionaries/ko";
import en from "../dictionaries/en";

function dict(locale: Locale) {
  return locale === "ko" ? ko : en;
}

/** `"파일명.jpg"의 파일 형식을 알 수 없습니다...` - 한국어는 파일명 뒤에 조사가 붙지만
 * 영어는 앞에 오므로(`The file type of "..." couldn't be determined`) 어순이 다르다. */
export function unknownFileTypeError(locale: Locale, filename: string): string {
  if (locale === "ko") {
    return `"${filename}"의 파일 형식을 알 수 없습니다. JPG, PNG, HEIC, PDF 파일로 다시 선택해 주세요.`;
  }
  return `Couldn't determine the file type of "${filename}". Please choose a JPG, PNG, HEIC, or PDF file instead.`;
}

/** "사진 3장 등록" / "Register 3 Photos" - 버튼 라벨. */
export function registerPhotosLabel(locale: Locale, count: number): string {
  if (locale === "ko") return `사진 ${count}장 등록`;
  return `Register ${count} Photo${count === 1 ? "" : "s"}`;
}

/** "등록된 영수증 (3) · 탭하면 인식 결과를 볼 수 있어요" 헤딩 전체를 조립한다. */
export function registeredReceiptsHeading(locale: Locale, count: number, autoSettlement: boolean): string {
  const t = dict(locale);
  const suffix = autoSettlement ? t.receiptManager.tapToViewOcr : t.receiptManager.tapToViewDetail;
  return `${t.receiptManager.registeredReceiptsHeading} (${count}) · ${suffix}`;
}

/** "Gemma 2 9B로 인식됨" / "Recognized by Gemma 2 9B" - 모델명은 번역 대상이 아니라 그대로 끼운다. */
export function recognizedByModel(locale: Locale, model: string): string {
  return locale === "ko" ? `${model}로 인식됨` : `Recognized by ${model}`;
}

const KO_DATE_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

/** OCR이 인식(또는 사용자가 입력)한 결제 일시 표시 - 항상 한국 시각 기준. */
export function formatOcrDate(locale: Locale, iso: string | null): string {
  const t = dict(locale);
  if (!iso) return t.receiptManager.amountNotRecognized;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t.receiptManager.amountNotRecognized;
  return d.toLocaleString(locale === "ko" ? "ko-KR" : "en-US", KO_DATE_OPTS);
}

export function formatOcrAmount(locale: Locale, amount: number | null): string {
  const t = dict(locale);
  if (amount === null) return t.receiptManager.amountNotRecognized;
  return locale === "ko" ? `${amount.toLocaleString("ko-KR")}원` : `${amount.toLocaleString("en-US")} KRW`;
}

/**
 * 업로드 실패 원인을 구분해서 보여준다 - describeUploadError()의 locale-aware 버전.
 * HEIC/PDF 변환처럼 이미 구체적인 원인 메시지를 만들어 던진 UploadStepError는 그 메시지를
 * 그대로 보여준다(해당 메시지는 발생 지점에서 이미 올바른 locale로 만들어져 있음).
 */
export function describeUploadError(locale: Locale, err: unknown, isUploadStepError: (e: unknown) => boolean): string {
  const t = dict(locale);
  if (isUploadStepError(err)) return (err as Error).message;
  const message = err instanceof Error ? err.message : "";
  const lower = message.toLowerCase();
  if (/abort|timeout|시간/.test(lower)) return t.receiptManager.errTimeout;
  return t.receiptManager.errGeneric;
}
