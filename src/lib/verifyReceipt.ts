import rules from "../../rules/domestic_travel_rules.json";
import { getKstParts } from "./kst";

export type VerdictStatus = "APPROVED" | "PARTIAL" | "REJECTED";

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

  // 순서7: 금액 상한 (부분인정)
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

export type TransportInput = {
  mode: "SHIP" | "AIR" | "RAIL" | "PRIVATE_CAR" | "BUS";
  ocrStatus: "DONE" | "FAILED";
  ocrText: string | null;
  ocrAmountGuess: number | null;
  ocrDateGuess: string | null;
  tripStartDate: string;
  tripEndDate: string;
  tripLocations: string[]; // 출발지+경유지+도착지 전체
};

/**
 * 선박/항공만 OCR로 실제 판정한다. 고속철도/승용(렌트,동승)/버스는 정액정산 대상이라
 * analyzeReceipt.ts에서 OCR 자체를 건너뛰고 바로 승인 처리하지만, 혹시 이 함수가 직접
 * 호출되더라도 방어적으로 같은 결과를 내도록 여기서도 분기한다.
 */
export function verifyTransport(input: TransportInput): VerificationResult {
  const regulationRef = rules.transport.regulation_ref;
  if (isFlatRateTransportMode(input.mode)) {
    return { status: "APPROVED", acceptedAmount: null, message: FLAT_RATE_MESSAGE, failedCheckId: null, regulationRef };
  }

  const modeRules = input.mode === "SHIP" ? rules.transport.ship : rules.transport.air;

  if (input.ocrStatus !== "DONE" || !input.ocrText || input.ocrAmountGuess === null) {
    return rejected(OCR_UNAVAILABLE_MESSAGE, "ocr_unavailable", regulationRef);
  }

  // 순서1: 업체유형 확인 - 선박/항공 관련 영수증이 맞는지 (숙박/조식 영수증 오인식 방지)
  if (!containsAny(input.ocrText, modeRules.required_keywords)) {
    return rejected(
      getCheckMessage(modeRules.checks, "not_transport_receipt"),
      "not_transport_receipt",
      regulationRef
    );
  }

  // 순서2: 좌석 등급 확인
  if (containsAny(input.ocrText, modeRules.disallowed_classes)) {
    return rejected(getCheckMessage(modeRules.checks, "class_restriction"), "class_restriction", regulationRef);
  }

  // 순서3: 장소 일치 확인 (출장경로 전체 중 하나라도 영수증 텍스트에 포함되면 통과)
  if (!isLocationMatch(input.ocrText, input.tripLocations)) {
    return rejected(getCheckMessage(modeRules.checks, "location_mismatch"), "location_mismatch", regulationRef);
  }

  // 순서4: 출장기간 날짜 확인 (공통 규칙)
  if (!isWithinTripDateRange(input.ocrDateGuess, input.tripStartDate, input.tripEndDate)) {
    return rejected(TRIP_DATE_MISMATCH_MESSAGE, "trip_date_mismatch", regulationRef);
  }

  return {
    status: "APPROVED",
    acceptedAmount: input.ocrAmountGuess,
    message: null,
    failedCheckId: null,
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
};

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

  // 순서2: 출장기간 날짜 확인 (공통 규칙)
  if (!isWithinTripDateRange(input.ocrDateGuess, input.tripStartDate, input.tripEndDate)) {
    return rejected(TRIP_DATE_MISMATCH_MESSAGE, "trip_date_mismatch", regulationRef);
  }

  // 순서3: 장소 일치 확인 (도착지/경유지 중 하나라도 영수증 텍스트에 포함되면 통과)
  if (!isLocationMatch(input.ocrText, input.tripLocations)) {
    return rejected(getCheckMessage(r.checks, "location_mismatch"), "location_mismatch", regulationRef);
  }

  // 순서4: 금액 상한 (부분인정) - 2박/3박이면 1박당 상한 × 박수로 늘어난다
  if (input.ocrAmountGuess === null) {
    return rejected(getCheckMessage(r.checks, "not_a_receipt"), "not_a_receipt", regulationRef);
  }
  const capForStay = r.daily_cap_krw * nights;
  if (input.ocrAmountGuess > capForStay) {
    const cappedMessage =
      nights > 1
        ? `1박당 최대 ${r.daily_cap_krw.toLocaleString("ko-KR")}원 기준, ${nights}박 총액 최대 ${capForStay.toLocaleString("ko-KR")}원까지만 정산됨을 안내드립니다`
        : getCheckMessage(r.checks, "amount_cap");
    return {
      status: "PARTIAL",
      acceptedAmount: capForStay,
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