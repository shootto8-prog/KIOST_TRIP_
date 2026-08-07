import { runReceiptOcr, type ReceiptImage } from "./receiptOcr";
import { extractReceiptHints } from "./receiptHints";
import { parseKstDatetime } from "./kst";
import { maskSensitiveReceiptText } from "./maskSensitiveText";
import {
  verifyBreakfast,
  verifyTransport,
  verifyLodging,
  verifyFieldPhoto,
  verifySubmitted,
  isFlatRateTransportMode,
  type VerificationResult,
} from "./verifyReceipt";

export type AnalyzeReceiptInput = {
  /** 첨부된 사진(파일) 목록 - 각 원소가 사진 1장의 페이지들이다(PDF는 이미 페이지별로 펼쳐진 상태). */
  photos: ReceiptImage[][];
  category: "BREAKFAST" | "TRANSPORT" | "LODGING" | "FIELD";
  transportMode: "SHIP" | "AIR" | "RAIL" | "PRIVATE_CAR" | "BUS" | null;
  tripStartDate: string;
  tripEndDate: string;
  tripLocationsAll: string[]; // 출발+경유+도착 (조식/교통용)
  tripLocationsNonDeparture: string[]; // 경유+도착 (숙박용)
  /** 출장기간(출발~복귀)으로 자동 계산한 박수 (숙박용). */
  nights: number;
  /**
   * 같은 출장의 "다른" 숙박 영수증들이 이미 인정받은 금액 합계 (숙박용, 이 영수증 자신은 제외).
   * 호출부(POST /api/receipts, reanalyze)가 DB에서 집계해 넘긴다.
   */
  lodgingAlreadyAcceptedInTrip?: number;
  /** 출장 단위 설정. false면 OCR을 아예 돌리지 않고 "제출"로만 기록한다(카테고리와 무관). */
  autoSettlement: boolean;
};

export type AnalyzeReceiptOutput = {
  ocrStatus: "PENDING" | "DONE" | "FAILED";
  ocrText: string | null;
  ocrAmountGuess: number | null;
  ocrDateGuess: Date | null;
  ocrMerchantGuess: string | null;
  ocrModel: string | null;
  verdict: VerificationResult;
};

type SingleOcrResult = {
  ocrStatus: "DONE" | "FAILED";
  ocrText: string | null;
  ocrAmountGuess: number | null;
  /** 금액이 "합계/총액" 키워드 없이 추정된 폴백 값인지 (receiptHints.ts 참고). */
  ocrAmountIsEstimate: boolean;
  ocrDateGuess: Date | null;
  ocrMerchantGuess: string | null;
  ocrModel: string | null;
};

/** 교통처럼 사진별로 따로 인식하는 경우, 합쳐진 요약값과 함께 사진별 결과도 들고 다닌다. */
type MultiOcrResult = SingleOcrResult & { perPhoto: SingleOcrResult[] };

const NO_OCR_RESULT: AnalyzeReceiptOutput = {
  ocrStatus: "PENDING",
  ocrText: null,
  ocrAmountGuess: null,
  ocrDateGuess: null,
  ocrMerchantGuess: null,
  ocrModel: null,
  verdict: verifyFieldPhoto(), // 임시값, 호출부에서 실제 verdict로 덮어씀
};

async function runOcrOnImages(images: ReceiptImage[]): Promise<SingleOcrResult> {
  try {
    const result = await runReceiptOcr(images);
    if (result.text) {
      // 금액/상호명/일시는 LLM의 구조화 추출(문맥 이해)을 우선 사용하고, 실패했을 때만
      // 원문 텍스트에 대한 정규식 휴리스틱으로 대체한다.
      const hints = extractReceiptHints(result.text);
      const dateSource = result.structured?.datetime ?? hints.dateGuess;
      const structuredAmount = result.structured?.amount ?? null;
      return {
        ocrStatus: "DONE",
        // 금액/일시/상호명 추출은 원문(result.text)으로 이미 끝났다 - 저장·화면표시용
        // ocrText만 마스킹해, 카드번호·승인번호가 DB에 평문으로 남거나 "원문 텍스트 보기"에
        // 그대로 노출되지 않게 한다. (2026-08-07)
        ocrText: maskSensitiveReceiptText(result.text),
        ocrAmountGuess: structuredAmount ?? hints.amountGuess,
        // LLM이 금액을 못 뽑아서 정규식 폴백(가장 큰 숫자)에 기댄 경우에만 "추정값"이다.
        ocrAmountIsEstimate: structuredAmount === null && hints.amountIsEstimate,
        // dateSource는 타임존 표시가 없는 "한국 현지시각" 문자열이다 - new Date(...)로 바로
        // 바꾸면 실행 환경(Vercel은 UTC)의 타임존으로 잘못 해석돼 9시간 밀리는 버그가 있었다.
        ocrDateGuess: dateSource ? parseKstDatetime(dateSource) : null,
        ocrMerchantGuess: result.structured?.merchant ?? hints.merchantGuess,
        ocrModel: result.model,
      };
    }
  } catch (err) {
    // OCR 실패는 호출자(업로드/재분석)를 막지 않는다 - 인식 실패로만 표시한다.
    console.error("Receipt OCR failed:", err);
  }
  return {
    ocrStatus: "FAILED",
    ocrText: null,
    ocrAmountGuess: null,
    ocrAmountIsEstimate: false,
    ocrDateGuess: null,
    ocrMerchantGuess: null,
    ocrModel: null,
  };
}

/** 조식/숙박: 사진이 여러 장이어도 한 문서(하나의 청구서)로 보고 한 번의 OCR 호출로 합쳐 인식한다. */
async function runOcrMerged(photos: ReceiptImage[][]): Promise<SingleOcrResult> {
  return runOcrOnImages(photos.flat());
}

/**
 * 교통(선박/항공): 왕복처럼 사진마다 별개의 결제 건일 수 있어 사진별로 각각 OCR을 돌린 뒤
 * 인식된 금액을 코드에서 합산한다(사진 한 번에 합쳐 보내면 모델이 왕복 두 건을 하나로
 * 오인식하기 쉽기 때문).
 *
 * 여기서 만드는 ocrAmountGuess는 "인식된 금액의 합"(화면 표시용)이고, 실제 정산에 인정되는
 * 금액은 verifyTransport가 사진별 검사를 통과한 사진만 다시 합산해 정한다.
 */
async function runOcrSummed(photos: ReceiptImage[][]): Promise<MultiOcrResult> {
  const perPhoto = await Promise.all(photos.map((imgs) => runOcrOnImages(imgs)));
  const succeeded = perPhoto.filter((r) => r.ocrStatus === "DONE");
  if (succeeded.length === 0) {
    return { ...perPhoto[0], perPhoto };
  }
  const ocrText = perPhoto
    .map((r, i) => `--- 사진 ${i + 1} ---\n${r.ocrText ?? "(인식 불가)"}`)
    .join("\n\n");
  const ocrAmountGuess = succeeded.reduce((sum, r) => sum + (r.ocrAmountGuess ?? 0), 0);
  const ocrDateGuess = succeeded.find((r) => r.ocrDateGuess)?.ocrDateGuess ?? null;
  const ocrMerchantGuess = succeeded.find((r) => r.ocrMerchantGuess)?.ocrMerchantGuess ?? null;
  return {
    ocrStatus: "DONE",
    ocrText,
    ocrAmountGuess,
    ocrAmountIsEstimate: succeeded.some((r) => r.ocrAmountIsEstimate),
    ocrDateGuess,
    ocrMerchantGuess,
    ocrModel: succeeded[0].ocrModel,
    perPhoto,
  };
}

/**
 * 출장기간(출발~복귀)으로 "박수"를 자동 계산한다 - 8/1 출발, 8/4 복귀면 3박. 사용자 입력 불필요.
 * 출장 시작/종료일은 "YYYY-MM-DD" 형태로 입력받아 항상 UTC 자정으로 저장되므로(ECMAScript
 * 스펙상 날짜만 있는 문자열은 항상 UTC로 해석됨), 실행 환경 타임존과 무관하게 UTC 기준
 * getter로 읽어야 서버(UTC)/로컬(KST) 어디서 실행하든 같은 날짜가 나온다.
 */
export function tripNights(trip: { startDate: Date; endDate: Date }): number {
  const start = trip.startDate;
  const end = trip.endDate;
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const diffDays = Math.round((endDay - startDay) / 86400000);
  return Math.max(1, diffDays);
}

/**
 * OCR 실행 + 힌트 추출 + 항목별 판정을 한 번에 처리한다. 최초 업로드(POST /api/receipts)와
 * 재분석(POST /api/receipts/[id]/reanalyze)이 동일한 로직을 공유하기 위해 분리했다.
 *
 * 현장사진(FIELD)과 정액정산 교통수단(고속철도/승용/버스)은 OCR/판정 대상이 아니라 사진 첨부만으로
 * 바로 인정 처리하고 OCR 자체를 건너뛴다.
 */
export async function analyzeReceipt(input: AnalyzeReceiptInput): Promise<AnalyzeReceiptOutput> {
  // 자동정산을 쓰지 않는 출장은 카테고리와 무관하게 OCR 자체를 건너뛰고 "제출"로만 기록한다 -
  // 인정/불인정 표현을 쓰면 자동으로 걸러진 것으로 오해할 수 있어서다. (2026-08-07)
  if (!input.autoSettlement) {
    return { ...NO_OCR_RESULT, verdict: verifySubmitted() };
  }

  if (input.category === "FIELD") {
    return { ...NO_OCR_RESULT, verdict: verifyFieldPhoto() };
  }

  if (input.category === "TRANSPORT" && input.transportMode && isFlatRateTransportMode(input.transportMode)) {
    return {
      ...NO_OCR_RESULT,
      verdict: verifyTransport({
        mode: input.transportMode,
        ocrStatus: "FAILED",
        ocrText: null,
        ocrAmountGuess: null,
        ocrDateGuess: null,
        tripStartDate: input.tripStartDate,
        tripEndDate: input.tripEndDate,
        tripLocations: input.tripLocationsAll,
      }),
    };
  }

  const multi = input.category === "TRANSPORT" ? await runOcrSummed(input.photos) : null;
  const ocr: SingleOcrResult = multi ?? (await runOcrMerged(input.photos));
  const ocrDateGuessIso = ocr.ocrDateGuess ? ocr.ocrDateGuess.toISOString() : null;

  const verdict =
    input.category === "BREAKFAST"
      ? verifyBreakfast({
          ocrStatus: ocr.ocrStatus,
          ocrText: ocr.ocrText,
          ocrAmountGuess: ocr.ocrAmountGuess,
          ocrAmountIsEstimate: ocr.ocrAmountIsEstimate,
          ocrDateGuess: ocrDateGuessIso,
          tripStartDate: input.tripStartDate,
          tripEndDate: input.tripEndDate,
          tripLocations: input.tripLocationsAll,
        })
      : input.category === "TRANSPORT"
      ? verifyTransport({
          mode: input.transportMode as "SHIP" | "AIR",
          ocrStatus: ocr.ocrStatus,
          ocrText: ocr.ocrText,
          ocrAmountGuess: ocr.ocrAmountGuess,
          ocrAmountIsEstimate: ocr.ocrAmountIsEstimate,
          ocrDateGuess: ocrDateGuessIso,
          tripStartDate: input.tripStartDate,
          tripEndDate: input.tripEndDate,
          tripLocations: input.tripLocationsAll,
          // 사진별로 업체유형/좌석등급/장소를 각각 검사해, 통과한 사진의 금액만 합산하게 한다.
          photos: multi?.perPhoto,
        })
      : verifyLodging({
          ocrStatus: ocr.ocrStatus,
          ocrText: ocr.ocrText,
          ocrAmountGuess: ocr.ocrAmountGuess,
          ocrAmountIsEstimate: ocr.ocrAmountIsEstimate,
          ocrDateGuess: ocrDateGuessIso,
          tripStartDate: input.tripStartDate,
          tripEndDate: input.tripEndDate,
          tripLocations: input.tripLocationsNonDeparture,
          nights: input.nights,
          alreadyAcceptedInTrip: input.lodgingAlreadyAcceptedInTrip,
        });

  return {
    ocrStatus: ocr.ocrStatus,
    ocrText: ocr.ocrText,
    ocrAmountGuess: ocr.ocrAmountGuess,
    ocrDateGuess: ocr.ocrDateGuess,
    ocrMerchantGuess: ocr.ocrMerchantGuess,
    ocrModel: ocr.ocrModel,
    verdict,
  };
}
