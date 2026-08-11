import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import type { LocalTrip, LocalReceipt } from "./localDb";

/**
 * assembleTripPdf()는 IndexedDB(localDb)와 브라우저 fetch(폰트/안내이미지)에 의존해 이
 * vitest 환경(Node, IndexedDB 폴리필 없음)에서 그대로 못 돌린다 - localDb와 global.fetch를
 * 모킹해서 실제로 PDF를 조립하고, 결과 바이트가 pdf-lib로 다시 열리는(=유효한 PDF인) 것까지
 * 확인한다. 영어 버전 작업(2026-08-11)에서 가장 리스크가 크다고 판단된 부분 - 컬럼 폭을
 * 헤더/셀 텍스트 실측으로 동적 계산하도록 바꾼 게 실제로 예외 없이 동작하는지, 한국어/영어
 * 둘 다 유효한 PDF가 나오는지를 이 테스트가 검증한다(단, 실제 화면 렌더링/줄바꿈이 "보기 좋은지"
 * 같은 시각적 판단까지는 이 환경에서 확인 불가 - 사용자의 육안 확인이 여전히 필요).
 */

const FONTS_DIR = path.resolve(__dirname, "../../public/fonts");

const trip: LocalTrip = {
  id: "trip-1",
  status: "COMPLETED",
  settlementMode: "DETAILED",
  autoSettlement: true,
  grade: "JUNIOR",
  startDate: "2026-08-01",
  endDate: "2026-08-03",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-03T00:00:00.000Z",
  stops: [
    { id: "s1", type: "DEPARTURE", location: "부산", order: 0 },
    { id: "s2", type: "ARRIVAL", location: "서울", order: 1 },
  ],
  mealDeductionCount: 0,
};

const receipts: LocalReceipt[] = [
  {
    id: "r1",
    tripId: "trip-1",
    category: "BREAKFAST",
    transportMode: null,
    createdAt: "2026-08-02T00:00:00.000Z",
    images: [],
    ocrStatus: "DONE",
    ocrText: "some receipt text",
    ocrAmountGuess: 12000,
    ocrDateGuess: "2026-08-02T07:00:00.000Z",
    ocrMerchantGuess: "김밥천국",
    ocrModel: "test-model",
    verdictStatus: "APPROVED",
    verdictAmount: 12000,
    verdictMessage: null,
    verdictFailedCheck: null,
    verdictRegulationRef: null,
  },
  {
    id: "r2",
    tripId: "trip-1",
    category: "TRANSPORT",
    transportMode: "AIR",
    createdAt: "2026-08-01T00:00:00.000Z",
    images: [],
    ocrStatus: "DONE",
    ocrText: "flight ticket",
    ocrAmountGuess: 85000,
    ocrDateGuess: "2026-08-01T09:00:00.000Z",
    ocrMerchantGuess: "Korean Air",
    ocrModel: "test-model",
    verdictStatus: "APPROVED",
    verdictAmount: 85000,
    verdictMessage: null,
    verdictFailedCheck: null,
    verdictRegulationRef: "제5조",
  },
];

vi.mock("./localDb", () => ({
  getTrip: vi.fn(async () => trip),
  listReceiptsByTrip: vi.fn(async () => receipts),
  getReceiptImageBytes: vi.fn(async () => null),
}));

let regularFontBytes: ArrayBuffer;
let boldFontBytes: ArrayBuffer;

beforeAll(async () => {
  const regular = await readFile(path.join(FONTS_DIR, "Pretendard-Regular.ttf"));
  const bold = await readFile(path.join(FONTS_DIR, "Pretendard-Bold.ttf"));
  regularFontBytes = regular.buffer.slice(regular.byteOffset, regular.byteOffset + regular.byteLength);
  boldFontBytes = bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("Pretendard-Regular")) {
        return { ok: true, arrayBuffer: async () => regularFontBytes } as Response;
      }
      if (url.includes("Pretendard-Bold")) {
        return { ok: true, arrayBuffer: async () => boldFontBytes } as Response;
      }
      // settlement-notice.png 등 나머지는 404 취급 - assembleTripPdf가 조용히 건너뛴다.
      return { ok: false } as Response;
    })
  );
});

describe("assembleTripPdf", () => {
  it("한국어(locale 기본값)로 유효한 PDF를 생성한다", async () => {
    const { assembleTripPdf } = await import("./pdfAssembleClient");
    const blob = await assembleTripPdf("trip-1");
    expect(blob.type).toBe("application/pdf");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(1000);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("영어(locale='en')로도 유효한 PDF를 생성한다 - 동적 컬럼폭 계산이 예외 없이 동작", async () => {
    const { assembleTripPdf } = await import("./pdfAssembleClient");
    const blob = await assembleTripPdf("trip-1", "en");
    expect(blob.type).toBe("application/pdf");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(1000);
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("간편모드(SIMPLE) 출장도 en/ko 둘 다 예외 없이 생성된다", async () => {
    const { assembleTripPdf } = await import("./pdfAssembleClient");
    const simpleTrip: LocalTrip = { ...trip, settlementMode: "SIMPLE" };
    const localDb = await import("./localDb");
    vi.mocked(localDb.getTrip).mockResolvedValueOnce(simpleTrip);
    const blobKo = await assembleTripPdf("trip-1");
    expect(blobKo.type).toBe("application/pdf");

    vi.mocked(localDb.getTrip).mockResolvedValueOnce(simpleTrip);
    const blobEn = await assembleTripPdf("trip-1", "en");
    expect(blobEn.type).toBe("application/pdf");
  });
});
