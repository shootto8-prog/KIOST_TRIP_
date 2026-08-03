import { runReceiptOcr, type ReceiptImage } from "./receiptOcr";
import { extractReceiptHints } from "./receiptHints";
import {
  verifyBreakfast,
  verifyTransport,
  verifyLodging,
  verifyFieldPhoto,
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
  ocrDateGuess: Date | null;
  ocrMerchantGuess: string | null;
  ocrModel: string | null;
};

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
      return {
        ocrStatus: "DONE",
        ocrText: result.text,
        ocrAmountGuess: result.structured?.amount ?? hints.amountGuess,
        ocrDateGuess: dateSource ? new Date(dateSource) : null,
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
 */
async function runOcrSummed(photos: ReceiptImage[][]): Promise<SingleOcrResult> {
  const perPhoto = await Promise.all(photos.map((imgs) => runOcrOnImages(imgs)));
  const succeeded = perPhoto.filter((r) => r.ocrStatus === "DONE");
  if (succeeded.length === 0) {
    return perPhoto[0];
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
    ocrDateGuess,
    ocrMerchantGuess,
    ocrModel: succeeded[0].ocrModel,
  };
}

/** 출장기간(출발~복귀)으로 "박수"를 자동 계산한다 - 8/1 출발, 8/4 복귀면 3박. 사용자 입력 불필요. */
export function tripNights(trip: { startDate: Date; endDate: Date }): number {
  const start = trip.startDate;
  const end = trip.endDate;
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diffDays = Math.round((endDay.getTime() - startDay.getTime()) / 86400000);
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

  const ocr = input.category === "TRANSPORT" ? await runOcrSummed(input.photos) : await runOcrMerged(input.photos);
  const ocrDateGuessIso = ocr.ocrDateGuess ? ocr.ocrDateGuess.toISOString() : null;

  const verdict =
    input.category === "BREAKFAST"
      ? verifyBreakfast({
          ocrStatus: ocr.ocrStatus,
          ocrText: ocr.ocrText,
          ocrAmountGuess: ocr.ocrAmountGuess,
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
          ocrDateGuess: ocrDateGuessIso,
          tripStartDate: input.tripStartDate,
          tripEndDate: input.tripEndDate,
          tripLocations: input.tripLocationsAll,
        })
      : verifyLodging({
          ocrStatus: ocr.ocrStatus,
          ocrText: ocr.ocrText,
          ocrAmountGuess: ocr.ocrAmountGuess,
          ocrDateGuess: ocrDateGuessIso,
          tripStartDate: input.tripStartDate,
          tripEndDate: input.tripEndDate,
          tripLocations: input.tripLocationsNonDeparture,
          nights: input.nights,
        });

  return { ...ocr, verdict };
}
