import rules from "../../rules/domestic_travel_rules.json";
import { getKstParts } from "./kst";

/**
 * PENDING은 "자동 판정을 보류하고 사람이 확인해야 한다"는 뜻이다 - 금액을 키워드 없이
 * 추정값으로만 읽어낸 경우처럼, 그 값을 그대로 정산에 반영하면 위험한 상황에 쓴다.
 * (DB/화면의 VerdictStatus에는 이미 PENDING이 있어 별도 마이그레이션이 필요 없다.)
 */
export type VerdictStatus = "PENDING" | "APPROVED" | "PARTIAL" | "REJECTED";

export type VerificationResult = {
  status: VerdictStatus;
  acceptedAmount: number | null;
  message: string | null;
  failedCheckId: string | null;
  regulationRef: string;
};

const OCR_UNAVAILABLE_MESSAGE =
  "영수증 내용을 인식할 수 없어 자동 판정이 불가합니다. 다시 촬영해 주세요.";

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * 지명은 단순 substring 포함검사로는 오탐이 난다 - 예) "대구"가 "해운대구"(부산 해운대'구')
 * 중간에 우연히 끼어 매칭됨. 지명 문자열 시작 위치의 "앞 글자"가 한글이 아니면(공백/줄바꿈/
 * 문자열 시작 등)만 진짜 지명의 시작으로 인정한다. 뒷 글자는 "부산광역시"처럼 지명 뒤에
 * 접미사가 곧바로 붙는 경우가 정상이므로 검사하지 않는다.
 */
function containsLocationToken(text: string, location: string): boolean {
  if (!location) return false;
  let idx = text.indexOf(location);
  while (idx !== -1) {
    const prevChar = idx === 0 ? null : text[idx - 1];
    if (prevChar === null || !/[가-힣]/.test(prevChar)) {
      return true;
    }
    idx = text.indexOf(location, idx + 1);
  }
  return false;
}

/** 트립 장소 목록 중 하나라도 영수증 텍스트에 포함되어 있으면 장소가 일치하는 것으로 본다. */
function isLocationMatch(text: string, tripLocations: string[]): boolean {
  return tripLocations.some((loc) => loc.trim().length > 0 && containsLocationToken(text, loc.trim()));
}

/**
 * 영수증에서 인식된 날짜(시각 무관, 일 단위)가 출장 출발일~도착일 범위 안에 있는지 확인한다.
 * 실행 환경(로컬은 KST, Vercel은 UTC)에 따라 달력 날짜가 다르게 읽히지 않도록, 항상
 * 한국 달력 기준(getKstParts)으로 비교한다.
 */
function isWithinTripDateRange(
  ocrDateGuess: string | null,
  tripStartDate: string,
  tripEndDate: string
): boolean {
  if (!ocrDateGuess) return false;
  const d = new Date(ocrDateGuess);
  if (Number.isNaN(d.getTime())) return false;

  const dDay = getKstParts(d);
  const startDay = getKstParts(new Date(tripStartDate));
  const endDay = getKstParts(new Date(tripEndDate));
  const dDayNum = Date.UTC(dDay.year, dDay.month, dDay.day);
  const startDayNum = Date.UTC(startDay.year, startDay.month, startDay.day);
  const endDayNum = Date.UTC(endDay.year, endDay.month, endDay.day);
  return dDayNum >= startDayNum && dDayNum <= endDayNum;
}

type CheckDef = { id: string; on_fail?: { message: string } };

/** id로 checks 배열에서 실패 메시지를 찾는다 (배열 순서가 바뀌어도 안전하도록 위치 인덱스 대신 id로 조회). */
function getCheckMessage(checks: CheckDef[], id: string): string {
  const check = checks.find((c) => c.id === id);
  if (!check?.on_fail) {
    throw new Error(`규칙 정의 오류: check id "${id}"의 on_fail 메시지를 찾을 수 없습니다.`);
  }
  return check.on_fail.message;
}

function rejected(message: string, failedCheckId: string, regulationRef: string): VerificationResult {
  return { status: "REJECTED", acceptedAmount: null, message, failedCheckId, regulationRef };
}

/**
 * 금액을 "합계/총액" 같은 키워드 없이 전체 텍스트에서 가장 큰 숫자로만 추정한 경우
 * (receiptHints.ts의 폴백 경로), 사업자등록번호 뒷자리나 카드 승인번호가 금액으로 잡힐 수 있다.
 * 이런 값은 자동 판정에 그대로 쓰지 않고 "확인 필요"(PENDING)로 남겨 사람이 검토하게 한다.
 */
export const AMOUNT_ESTIMATED_CHECK_ID = "amount_estimated";
const AMOUNT_ESTIMATED_MESSAGE =
  "금액을 정확히 인식하지 못해 추정값으로 읽었습니다. 자동 정산에 반영하지 않으니 확인 후 다시 인식하거나 더 선명한 사진으로 등록해 주세요.";

function needsAmountReview(regulationRef: string): VerificationResult {
  return {
    status: "PENDING",
    acceptedAmount: null,
    message: AMOUNT_ESTIMATED_MESSAGE,
    failedCheckId: AMOUNT_ESTIMATED_CHECK_ID,
    regulationRef,
  };
}

/** 영수증 1장당 하나만 찍히는 사업자등록번호(NNN-NN-NNNNN)가 몇 종류인지 센다. */
function distinctBusinessNumberCount(text: string): number {
  return new Set(text.match(/\d{3}-\d{2}-\d{5}/g) ?? []).size;
}

/**
 * 영수증 텍스트에 등장하는 "달력 날짜"가 몇 종류인지 센다 (체크인/거래일자/거래일시 등).
 * "2026-07-21", "2026.07.21", "2026/07/21", "2026년 7월 21일"을 모두 같은 하루로 묶는다.
 * 연도를 19xx/20xx로 못박아 사업자등록번호·전화번호·승인번호가 날짜로 오인되지 않게 한다.
 */
function distinctCalendarDates(text: string): Set<string> {
  const found = new Set<string>();
  const re = /(19|20)(\d{2})\s*(?:[-./]|년)\s*(\d{1,2})\s*(?:[-./]|월)\s*(\d{1,2})(?:\s*일)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const year = Number(`${m[1]}${m[2]}`);
    const month = Number(m[3]);
    const day = Number(m[4]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    found.add(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return found;
}

const TRIP_DATE_MISMATCH_MESSAGE = rules.common.trip_date_mismatch.on_fail.message;
const FLAT_RATE_MESSAGE = "정액정산 대상으로 별도 금액 확인 없이 인정됩니다.";

/** 고속철도/승용(렌트,동승)/버스는 정액정산 대상이라 OCR 판정 없이 사진만 첨부하면 바로 인정한다. */
export const FLAT_RATE_TRANSPORT_MODES = ["RAIL", "PRIVATE_CAR", "BUS"] as const;
export function isFlatRateTransportMode(mode: string): boolean {
  return (FLAT_RATE_TRANSPORT_MODES as readonly string[]).includes(mode);
}

/** 현장사진: 판정 대상이 아니라 그냥 증빙 기록이라 항상 인정 처리한다. */
export function verifyFieldPhoto(): VerificationResult {
  return { status: "APPROVED", acceptedAmount: null, message: null, failedCheckId: null, regulationRef: "" };
}

export type BreakfastInput = {
  ocrStatus: "DONE" | "FAILED";
  ocrText: string | null;
  ocrAmountGuess: number | null;
  ocrDateGuess: string | null; // ISO
  tripStartDate: string; // ISO
  tripEndDate: string; // ISO
  tripLocations: string[]; // 출발지+경유지+도착지 전체
  /** 금액이 "합계/총액" 키워드 없이 추정된 값인지 (true면 자동 판정 대신 확인 필요로 남긴다). */
  ocrAmountIsEstimate?: boolean;
};

export function verifyBreakfast(input: BreakfastInput): VerificationResult {
  const r = rules.breakfast;
  const regulationRef = r.regulation_ref;

  // 순서1: 품목 확인
  if (input.ocrStatus !== "DONE" || !input.ocrText || input.ocrText.trim().length < 5) {
    return rejected(
      input.ocrStatus !== "DONE" ? OCR_UNAVAILABLE_MESSAGE : getCheckMessage(r.checks, "item_unrecognized"),
      "item_unrecognized",
      regulationRef
    );
  }
  if (input.ocrAmountGuess === null) {
    return rejected(getCheckMessage(r.checks, "item_unrecognized"), "item_unrecognized", regulationRef);
  }

  // 순서2: 출장기간 날짜 확인 (공통 규칙) - 출장기간이 아닌 날짜의 영수증 반영 방지
  if (!isWithinTripDateRange(input.ocrDateGuess, input.tripStartDate, input.tripEndDate)) {
    return rejected(TRIP_DATE_MISMATCH_MESSAGE, "trip_date_mismatch", regulationRef);
  }

  // 순서3: 장소 일치 확인 (출장경로 전체 중 하나라도 영수증 텍스트에 포함되면 통과)
  if (!isLocationMatch(input.ocrText, input.tripLocations)) {
    return rejected(getCheckMessage(r.checks, "location_mismatch"), "location_mismatch", regulationRef);
  }

  // 순서4: 시간대 확인 (05:00:00~10:00:59) - 날짜는 이미 출장기간 내로 확인됨, 시각만 비교
  // 실행 환경 타임존과 무관하게 한국 시각 기준으로 시/분/초를 뽑아야 한다(Vercel은 UTC로 돌아가서
  // 로컬 getHours() 등을 쓰면 9시간 밀린 값으로 판정하는 버그가 있었다).
  const { hour, minute, second } = getKstParts(new Date(input.ocrDateGuess!));
  const secondsOfDay = hour * 3600 + minute * 60 + second;
  const [sh, sm, ssec] = r.allowed_time_window.start.split(":").map(Number);
  const [eh, em, esec] = r.allowed_time_window.end.split(":").map(Number);
  const startSec = sh * 3600 + sm * 60 + ssec;
  const endSec = eh * 3600 + em * 60 + esec;
  if (secondsOfDay < startSec || secondsOfDay > endSec) {
    return rejected(getCheckMessage(r.checks, "time_window"), "time_window", regulationRef);
  }

  // 순서5: 불인정 품목 포함 여부
  if (containsAny(input.ocrText, r.disallowed_item_keywords)) {
    return rejected(getCheckMessage(r.checks, "disallowed_item"), "disallowed_item", regulationRef);
  }

  // 순서6: 영수증 매수 (한 사진에 여러 영수증이 찍힌 경우)
  // "합계/총액/결제금액" 같은 문구 개수로 세면, 할인 적용 전(합계)·후(결제금액) 금액을 각각
  // 표시하는 흔한 단일 영수증 포맷에서 오탐이 난다(예: "합계 13,000" 다음에 할인 후
  // "결제 금액 12,600"). 사업자등록번호(NNN-NN-NNNNN)는 영수증 1장당 하나만 나오므로,
  // 서로 다른 번호가 몇 개 찍혔는지로 세는 게 실제 "영수증이 몇 장 붙어있는지"에 더 가깝다.
  const distinctBizNumbers = new Set(input.ocrText.match(/\d{3}-\d{2}-\d{5}/g) ?? []);
  const boundaryMarkers = distinctBizNumbers.size;
  if (boundaryMarkers > r.max_receipts) {
    return rejected(getCheckMessage(r.checks, "multiple_receipts"), "multiple_receipts", regulationRef);
  }

  // 순서7: 금액이 추정값이면 자동 판정 보류 (확인 필요)
  if (input.ocrAmountIsEstimate) {
    return needsAmountReview(regulationRef);
  }

  // 순서8: 금액 상한 (부분인정)
  if (input.ocrAmountGuess > r.amount_cap_krw) {
    return {
      status: "PARTIAL",
      acceptedAmount: r.amount_cap_krw,
      message: getCheckMessage(r.checks, "amount_cap"),
      failedCheckId: "amount_cap",
      regulationRef,
    };
  }

  return {
    status: "APPROVED",
    acceptedAmount: input.ocrAmountGuess,
    message: null,
    failedCheckId: null,
    regulationRef,
  };
}

/** 교통 영수증 사진 1장의 OCR 결과 (왕복처럼 사진마다 별개의 결제 건일 수 있다). */
export type TransportPhotoOcr = {
  ocrStatus: "DONE" | "FAILED";
  ocrText: string | null;
  ocrAmountGuess: number | null;
  /** 금액이 "합계/총액" 키워드 없이 추정된 값인지. */
  ocrAmountIsEstimate?: boolean;
};

export type TransportInput = {
  mode: "SHIP" | "AIR" | "RAIL" | "PRIVATE_CAR" | "BUS";
  ocrStatus: "DONE" | "FAILED";
  ocrText: string | null;
  ocrAmountGuess: number | null;
  ocrDateGuess: string | null;
  tripStartDate: string;
  tripEndDate: string;
  tripLocations: string[]; // 출발지+경유지+도착지 전체
  ocrAmountIsEstimate?: boolean;
  /**
   * 사진별 OCR 결과. 넘기면 사진 하나하나를 독립된 결제 증빙으로 보고 검사(업체유형/좌석등급/
   * 장소)를 각각 수행한 뒤, 전부 통과한 사진의 금액만 합산한다. 생략하면 위의 단일(합쳐진)
   * 결과 하나만 검사하는 기존 동작과 동일하다.
   */
  photos?: TransportPhotoOcr[];
};

/** 여러 장 중 일부만 인정된 경우의 판정 ID - 화면에서 "일부만 합산됨" 경고/재시도 버튼을 띄우는 데 쓴다. */
export const PARTIAL_OCR_FAILURE_CHECK_ID = "partial_ocr_failure";
export const PARTIAL_PHOTO_EXCLUDED_CHECK_ID = "partial_photo_excluded";

type PhotoOutcome =
  | { kind: "accepted"; amount: number }
  | { kind: "ocr_failed" }
  | { kind: "estimated" }
  | { kind: "check_failed"; failedCheckId: string; message: string };

type ModeRules = typeof rules.transport.ship | typeof rules.transport.air;

/**
 * 사진 1장에 대해 교통 검사(업체유형 -> 좌석등급 -> 장소)를 수행한다.
 * 예전에는 모든 사진의 텍스트를 이어붙여 딱 한 번만 검사해서, 사진1이 항공권이면 사진2가
 * 호텔 영수증이어도 그 금액까지 교통비로 합산되는 문제가 있었다.
 */
function checkTransportPhoto(
  photo: TransportPhotoOcr,
  modeRules: ModeRules,
  tripLocations: string[]
): PhotoOutcome {
  if (photo.ocrStatus !== "DONE" || !photo.ocrText || photo.ocrAmountGuess === null) {
    return { kind: "ocr_failed" };
  }
  // 순서1: 업체유형 확인 - 선박/항공 관련 영수증이 맞는지 (숙박/조식 영수증 오인식 방지)
  if (!containsAny(photo.ocrText, modeRules.required_keywords)) {
    return {
      kind: "check_failed",
      failedCheckId: "not_transport_receipt",
      message: getCheckMessage(modeRules.checks, "not_transport_receipt"),
    };
  }
  // 순서2: 좌석 등급 확인
  if (containsAny(photo.ocrText, modeRules.disallowed_classes)) {
    return {
      kind: "check_failed",
      failedCheckId: "class_restriction",
      message: getCheckMessage(modeRules.checks, "class_restriction"),
    };
  }
  // 순서3: 장소 일치 확인 (출장경로 전체 중 하나라도 영수증 텍스트에 포함되면 통과)
  if (!isLocationMatch(photo.ocrText, tripLocations)) {
    return {
      kind: "check_failed",
      failedCheckId: "location_mismatch",
      message: getCheckMessage(modeRules.checks, "location_mismatch"),
    };
  }
  // 순서4: 금액이 추정값이면 합산에서 제외 (사업자번호/승인번호를 금액으로 잡을 수 있음)
  if (photo.ocrAmountIsEstimate) {
    return { kind: "estimated" };
  }
  return { kind: "accepted", amount: photo.ocrAmountGuess };
}

function describeOutcome(outcome: PhotoOutcome): string {
  switch (outcome.kind) {
    case "ocr_failed":
      return "내용을 인식하지 못했습니다";
    case "estimated":
      return "금액을 추정값으로만 읽어 합산에서 제외했습니다";
    case "check_failed":
      return outcome.message;
    default:
      return "";
  }
}

/**
 * 선박/항공만 OCR로 실제 판정한다. 고속철도/승용(렌트,동승)/버스는 정액정산 대상이라
 * analyzeReceipt.ts에서 OCR 자체를 건너뛰고 바로 승인 처리하지만, 혹시 이 함수가 직접
 * 호출되더라도 방어적으로 같은 결과를 내도록 여기서도 분기한다.
 *
 * 날짜(결제일) 검사는 하지 않는다 - 항공/선박은 출장 전에 미리 예매·결제하는 것이 정상이라
 * 결제일을 출장기간과 비교하면 거의 모든 정상 영수증이 반려됐다. (2026-08-04 결정사항 1)
 */
export function verifyTransport(input: TransportInput): VerificationResult {
  const regulationRef = rules.transport.regulation_ref;
  if (isFlatRateTransportMode(input.mode)) {
    return { status: "APPROVED", acceptedAmount: null, message: FLAT_RATE_MESSAGE, failedCheckId: null, regulationRef };
  }

  const modeRules: ModeRules = input.mode === "SHIP" ? rules.transport.ship : rules.transport.air;

  const photos: TransportPhotoOcr[] =
    input.photos && input.photos.length > 0
      ? input.photos
      : [
          {
            ocrStatus: input.ocrStatus,
            ocrText: input.ocrText,
            ocrAmountGuess: input.ocrAmountGuess,
            ocrAmountIsEstimate: input.ocrAmountIsEstimate,
          },
        ];

  const outcomes = photos.map((p) => checkTransportPhoto(p, modeRules, input.tripLocations));
  const accepted = outcomes.filter((o): o is { kind: "accepted"; amount: number } => o.kind === "accepted");
  const failures = outcomes
    .map((o, i) => ({ outcome: o, index: i }))
    .filter((x) => x.outcome.kind !== "accepted");

  if (accepted.length === 0) {
    const firstCheckFailure = failures.find((f) => f.outcome.kind === "check_failed");
    if (firstCheckFailure && firstCheckFailure.outcome.kind === "check_failed") {
      const message =
        photos.length > 1
          ? failures.map((f) => `${f.index + 1}번째 사진: ${describeOutcome(f.outcome)}`).join("\n")
          : firstCheckFailure.outcome.message;
      return rejected(message, firstCheckFailure.outcome.failedCheckId, regulationRef);
    }
    if (failures.some((f) => f.outcome.kind === "estimated")) {
      return needsAmountReview(regulationRef);
    }
    return rejected(OCR_UNAVAILABLE_MESSAGE, "ocr_unavailable", regulationRef);
  }

  const acceptedAmount = accepted.reduce((sum, o) => sum + o.amount, 0);

  if (failures.length === 0) {
    return { status: "APPROVED", acceptedAmount, message: null, failedCheckId: null, regulationRef };
  }

  // 일부 사진만 인정된 경우: 조용히 성공처럼 보이지 않도록 부분인정으로 표시하고,
  // 어떤 사진이 왜 빠졌는지 알려준다.
  const anyOcrFailed = failures.some((f) => f.outcome.kind === "ocr_failed");
  const detail = failures.map((f) => `${f.index + 1}번째 사진: ${describeOutcome(f.outcome)}`).join("\n");
  const guidance = anyOcrFailed
    ? "\n인식하지 못한 사진이 있어 합계에서 빠졌습니다. '다시 인식 시도'를 눌러 주세요."
    : "\n위 사진은 합계에서 제외했습니다. 잘못 첨부한 사진이면 삭제 후 다시 등록해 주세요.";
  return {
    status: "PARTIAL",
    acceptedAmount,
    message: `사진 ${photos.length}장 중 ${accepted.length}장만 인정되었습니다.\n${detail}${guidance}`,
    failedCheckId: anyOcrFailed ? PARTIAL_OCR_FAILURE_CHECK_ID : PARTIAL_PHOTO_EXCLUDED_CHECK_ID,
    regulationRef,
  };
}

export type LodgingInput = {
  ocrStatus: "DONE" | "FAILED";
  ocrText: string | null;
  ocrAmountGuess: number | null;
  ocrDateGuess: string | null;
  tripStartDate: string;
  tripEndDate: string;
  tripLocations: string[]; // 도착지 + 경유지 (출발지 제외)
  /** 출장기간(출발~복귀)으로 자동 계산한 박수. 2박/3박이면 총액을 그만큼 나눠 1박당 상한을 적용한다. */
  nights: number;
  /** 금액이 "합계/총액" 키워드 없이 추정된 값인지. */
  ocrAmountIsEstimate?: boolean;
  /**
   * 같은 출장의 "다른" 숙박 영수증들이 이미 인정받은 금액의 합계(이 영수증 자신은 제외).
   * 출장 전체 상한에서 이 값을 뺀 "남은 한도"까지만 이번 영수증을 인정한다 - 영수증을 여러 건으로
   * 나눠 올려 출장 단위 상한을 우회하는 것을 막기 위함. (2026-08-04 결정사항 8)
   */
  alreadyAcceptedInTrip?: number;
};

export const TRIP_CAP_EXHAUSTED_CHECK_ID = "trip_cap_exhausted";
export const MULTIPLE_DOCUMENTS_CHECK_ID = "multiple_documents";

export function verifyLodging(input: LodgingInput): VerificationResult {
  const r = rules.lodging;
  const regulationRef = r.regulation_ref;
  const nights = input.nights > 0 ? input.nights : 1;

  if (input.ocrStatus !== "DONE" || !input.ocrText) {
    return rejected(OCR_UNAVAILABLE_MESSAGE, "ocr_unavailable", regulationRef);
  }

  // 순서1: 영수증 여부 확인
  if (!containsAny(input.ocrText, r.required_keywords)) {
    return rejected(getCheckMessage(r.checks, "not_a_receipt"), "not_a_receipt", regulationRef);
  }

  // 순서2: 한 건의 업로드에 서로 다른 여러 문서가 섞였는지 (2단계 신호)
  // 사업자등록번호 개수만으로 판단하면 정상적인 단일 OTA 예약(호텔 + 결제대행사 + 카드사)도
  // 2~3개가 나와 오반려된다. 그래서 "사업자번호가 여러 개" 그리고 "서로 다른 날짜가 여러 개"가
  // 동시에 잡힐 때만 여러 건이 섞인 것으로 본다. (2026-08-04 결정사항 7)
  const bizNumberCount = distinctBusinessNumberCount(input.ocrText);
  const dateCount = distinctCalendarDates(input.ocrText).size;
  if (bizNumberCount > r.max_business_numbers && dateCount > r.max_distinct_dates) {
    return rejected(
      getCheckMessage(r.checks, MULTIPLE_DOCUMENTS_CHECK_ID),
      MULTIPLE_DOCUMENTS_CHECK_ID,
      regulationRef
    );
  }

  // 순서3: 출장기간 날짜 확인 (공통 규칙)
  if (!isWithinTripDateRange(input.ocrDateGuess, input.tripStartDate, input.tripEndDate)) {
    return rejected(TRIP_DATE_MISMATCH_MESSAGE, "trip_date_mismatch", regulationRef);
  }

  // 순서4: 장소 일치 확인 (도착지/경유지 중 하나라도 영수증 텍스트에 포함되면 통과)
  if (!isLocationMatch(input.ocrText, input.tripLocations)) {
    return rejected(getCheckMessage(r.checks, "location_mismatch"), "location_mismatch", regulationRef);
  }

  if (input.ocrAmountGuess === null) {
    return rejected(getCheckMessage(r.checks, "not_a_receipt"), "not_a_receipt", regulationRef);
  }

  // 순서5: 금액이 추정값이면 자동 판정 보류 (확인 필요)
  if (input.ocrAmountIsEstimate) {
    return needsAmountReview(regulationRef);
  }

  // 순서6: 금액 상한 (부분인정) - 2박/3박이면 1박당 상한 × 박수로 늘어나고,
  // 같은 출장의 다른 숙박 영수증이 이미 쓴 만큼은 빼고 남은 한도까지만 인정한다.
  const capForStay = r.daily_cap_krw * nights;
  const alreadyAccepted = Math.max(0, input.alreadyAcceptedInTrip ?? 0);
  const remainingCap = capForStay - alreadyAccepted;

  if (remainingCap <= 0) {
    return rejected(
      `이미 숙박비 상한에 도달했습니다 (${nights}박 총 상한 ${capForStay.toLocaleString("ko-KR")}원, 이미 인정된 금액 ${alreadyAccepted.toLocaleString("ko-KR")}원). 추가 숙박비는 정산되지 않습니다.`,
      TRIP_CAP_EXHAUSTED_CHECK_ID,
      regulationRef
    );
  }

  if (input.ocrAmountGuess > remainingCap) {
    const cappedMessage =
      alreadyAccepted > 0
        ? `이 출장에서 이미 ${alreadyAccepted.toLocaleString("ko-KR")}원이 인정되어, 남은 한도 ${remainingCap.toLocaleString("ko-KR")}원까지만 정산됨을 안내드립니다 (${nights}박 총 상한 ${capForStay.toLocaleString("ko-KR")}원)`
        : nights > 1
        ? `1박당 최대 ${r.daily_cap_krw.toLocaleString("ko-KR")}원 기준, ${nights}박 총액 최대 ${capForStay.toLocaleString("ko-KR")}원까지만 정산됨을 안내드립니다`
        : getCheckMessage(r.checks, "amount_cap");
    return {
      status: "PARTIAL",
      acceptedAmount: remainingCap,
      message: cappedMessage,
      failedCheckId: "amount_cap",
      regulationRef,
    };
  }

  return {
    status: "APPROVED",
    acceptedAmount: input.ocrAmountGuess,
    message: null,
    failedCheckId: null,
    regulationRef,
  };
}
