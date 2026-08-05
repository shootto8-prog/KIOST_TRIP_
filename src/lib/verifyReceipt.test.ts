import { describe, it, expect } from "vitest";
import { verifyBreakfast, verifyTransport, verifyLodging } from "./verifyReceipt";
import { parseKstDatetime } from "./kst";

/**
 * Phase 5 검증 스위트. Phase 4에서 실제 이미지 업로드로 한 번 수동 검증했던 시나리오를
 * 여기에 고정 OCR 텍스트 fixture로 옮겨, LLM/서버 호출 없이 몇 초 안에 반복 재검증할 수 있게 한다.
 * "사람 재확인 없이 자동 확정"이 성립하려면 이 스위트가 항상 통과해야 한다.
 *
 * 날짜 fixture는 실제 OCR 파이프라인과 동일하게 parseKstDatetime(타임존 표시 없는 문자열을
 * 항상 한국 현지시각으로 해석)으로 만든다. verifyBreakfast도 내부적으로 한국 시각 기준
 * (getKstParts)으로 시각을 비교하므로, 테스트를 실행하는 컴퓨터의 타임존이 무엇이든(로컬 KST든
 * CI의 UTC든) 항상 같은 결과가 나온다.
 *
 * 트립은 항상 "대전 -> 부산" (2026-07-21 ~ 2026-07-22)을 기준으로 한다. 조식/교통은 출장경로
 * 전체(대전+부산)를 장소 후보로 쓰고, 숙박은 기존 스펙대로 도착지/경유지(부산)만 후보로 쓴다.
 */

const TRIP_START = new Date("2026-07-21").toISOString();
const TRIP_END = new Date("2026-07-22").toISOString();
const ALL_LOCATIONS = ["대전", "부산"];

function d(kstLocalDateTime: string): string {
  const parsed = parseKstDatetime(kstLocalDateTime);
  if (!parsed) throw new Error(`테스트 fixture 날짜 파싱 실패: ${kstLocalDateTime}`);
  return parsed.toISOString();
}

describe("verifyBreakfast", () => {
  it("정상 케이스: 출장경로 내 장소, 출장기간 내 날짜, 시간 내, 금액 이내 -> 인정", () => {
    const result = verifyBreakfast({
      ocrStatus: "DONE",
      ocrText:
        "스타벅스 대전둔산점\n사업자번호 123-45-67890\n대전광역시 서구 둔산동\n2026-07-21 07:35:12\n\n아메리카노 Tall 4,500\n카드결제\n\n합계금액 4,500원\n\n영수증",
      ocrAmountGuess: 4500,
      ocrDateGuess: d("2026-07-21T07:35:12"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(4500);
    expect(result.message).toBeNull();
  });

  it("출장기간 밖 날짜(7/25, 출장은 7/21~7/22): 불인정", () => {
    const result = verifyBreakfast({
      ocrStatus: "DONE",
      ocrText: "카페 대전점\n대전광역시\n2026-07-25 07:40:00\n합계금액 4,500원\n영수증",
      ocrAmountGuess: 4500,
      ocrDateGuess: d("2026-07-25T07:40:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("trip_date_mismatch");
  });

  it("장소 불일치(서울, 출장은 대전-부산): 불인정", () => {
    const result = verifyBreakfast({
      ocrStatus: "DONE",
      ocrText: "카페 서울점\n서울특별시 강남구\n2026-07-21 07:40:00\n합계금액 4,500원\n영수증",
      ocrAmountGuess: 4500,
      ocrDateGuess: d("2026-07-21T07:40:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("location_mismatch");
  });

  it("금액 초과: 15,000원 상한까지만 부분인정", () => {
    const result = verifyBreakfast({
      ocrStatus: "DONE",
      ocrText: "카페 대전점\n대전광역시\n2026-07-21 07:40:00\n합계금액 25,000원\n영수증",
      ocrAmountGuess: 25000,
      ocrDateGuess: d("2026-07-21T07:40:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("PARTIAL");
    expect(result.acceptedAmount).toBe(15000);
    expect(result.failedCheckId).toBe("amount_cap");
  });

  it("시간 초과(13:20, 날짜/장소는 유효): 불인정", () => {
    const result = verifyBreakfast({
      ocrStatus: "DONE",
      ocrText: "카페 대전점\n대전광역시\n2026-07-21 13:20:00\n합계금액 5,000원\n영수증",
      ocrAmountGuess: 5000,
      ocrDateGuess: d("2026-07-21T13:20:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("time_window");
  });

  it("불인정 품목(생맥주) 포함: 불인정", () => {
    const result = verifyBreakfast({
      ocrStatus: "DONE",
      ocrText:
        "국밥집 대전점\n대전광역시\n2026-07-21 08:10:00\n콩나물국밥 7,000\n생맥주 1잔 3,000\n합계금액 10,000원\n영수증",
      ocrAmountGuess: 10000,
      ocrDateGuess: d("2026-07-21T08:10:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("disallowed_item");
  });

  it("영수증 2장 병합(사업자번호 2회): 불인정", () => {
    const result = verifyBreakfast({
      ocrStatus: "DONE",
      ocrText:
        "스타벅스 대전점\n대전광역시\n사업자번호 111-11-11111\n2026-07-21 07:30:00\n합계금액 4,500원\n\n투썸플레이스\n사업자번호 222-22-22222\n2026-07-21 07:50:00\n합계금액 5,000원\n영수증",
      ocrAmountGuess: 4500,
      ocrDateGuess: d("2026-07-21T07:30:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("multiple_receipts");
  });

  it("금액이 추정값이면(키워드 없이 최댓값으로 추측) 자동 판정 보류(PENDING)", () => {
    // 사업자등록번호 뒷자리(67890)나 카드 승인번호가 금액으로 잡힐 수 있어, 이 값은
    // 자동 판정에 그대로 쓰지 않고 사람이 확인하게 한다.
    const result = verifyBreakfast({
      ocrStatus: "DONE",
      ocrText: "카페 대전점\n대전광역시\n사업자번호 123-45-67890\n2026-07-21 07:40:00\n영수증",
      ocrAmountGuess: 67890,
      ocrAmountIsEstimate: true,
      ocrDateGuess: d("2026-07-21T07:40:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("PENDING");
    expect(result.acceptedAmount).toBeNull();
    expect(result.failedCheckId).toBe("amount_estimated");
  });

  it("OCR 인식 자체가 실패(모델 429/타임아웃 등): ocr_unavailable로 불인정 - '다시 인식 시도' 버튼이 뜨려면 이 id여야 한다", () => {
    // 실사용 중 발견된 버그: 예전엔 이 경우도 failedCheckId가 "item_unrecognized"로 찍혀서
    // ReceiptManager의 RETRYABLE_FAILED_CHECKS에 안 걸렸고, 재시도 버튼 자체가 안 떴다.
    const result = verifyBreakfast({
      ocrStatus: "FAILED",
      ocrText: null,
      ocrAmountGuess: null,
      ocrDateGuess: null,
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("ocr_unavailable");
  });

  it("OCR은 됐지만 인식된 텍스트가 너무 짧음: item_unrecognized로 불인정 (ocr_unavailable과는 구분)", () => {
    const result = verifyBreakfast({
      ocrStatus: "DONE",
      ocrText: "abc",
      ocrAmountGuess: null,
      ocrDateGuess: null,
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("item_unrecognized");
  });
});

describe("verifyTransport", () => {
  it("선박 일반실, 출장경로/기간 내: 인정", () => {
    const result = verifyTransport({
      mode: "SHIP",
      ocrStatus: "DONE",
      ocrText: "연안여객선 탑승권\n부산항 - 제주항\n좌석등급: 일반실\n2026-07-21 09:00\n운임 45,000원\n영수증",
      ocrAmountGuess: 45000,
      ocrDateGuess: d("2026-07-21T09:00:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(45000);
  });

  it("선박 1등실: 불인정", () => {
    const result = verifyTransport({
      mode: "SHIP",
      ocrStatus: "DONE",
      ocrText: "연안여객선 탑승권\n부산항 - 제주항\n좌석등급: 1등실\n2026-07-21 09:00\n운임 45,000원\n영수증",
      ocrAmountGuess: 45000,
      ocrDateGuess: d("2026-07-21T09:00:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("class_restriction");
  });

  it("선박, 출장경로와 무관한 구간(인천-대구): 장소불일치로 불인정", () => {
    const result = verifyTransport({
      mode: "SHIP",
      ocrStatus: "DONE",
      ocrText: "연안여객선 탑승권\n인천항 - 대구항\n좌석등급: 일반실\n2026-07-21 09:00\n운임 45,000원\n영수증",
      ocrAmountGuess: 45000,
      ocrDateGuess: d("2026-07-21T09:00:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("location_mismatch");
  });

  it("항공 이코노미, 출장경로/기간 내: 인정", () => {
    const result = verifyTransport({
      mode: "AIR",
      ocrStatus: "DONE",
      ocrText: "국내선 항공권\n대전(청주) - 부산(김해)\n좌석등급: 이코노미\n2026-07-21 10:00\n운임 80,000원\n영수증",
      ocrAmountGuess: 80000,
      ocrDateGuess: d("2026-07-21T10:00:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(80000);
  });

  it("항공 비즈니스: 불인정", () => {
    const result = verifyTransport({
      mode: "AIR",
      ocrStatus: "DONE",
      ocrText: "국내선 항공권\n대전(청주) - 부산(김해)\n좌석등급: 비즈니스석\n2026-07-21 10:00\n운임 150,000원\n영수증",
      ocrAmountGuess: 150000,
      ocrDateGuess: d("2026-07-21T10:00:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("class_restriction");
  });

  it("항목1 회귀: 출장 전에 미리 예매·결제한 항공권(결제일 7/15, 출장은 7/21~7/22)도 인정", () => {
    // 항공/선박은 사전 예매·결제가 정상이라 결제일로 출장기간을 따지면 거의 모든 정상
    // 영수증이 반려됐다. 2026-08-04 결정으로 교통에서는 날짜 검사를 하지 않는다.
    const result = verifyTransport({
      mode: "AIR",
      ocrStatus: "DONE",
      ocrText: "국내선 항공권\n대전(청주) - 부산(김해)\n좌석등급: 이코노미\n결제일시 2026-07-15 10:00\n운임 80,000원\n영수증",
      ocrAmountGuess: 80000,
      ocrDateGuess: d("2026-07-15T10:00:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(80000);
    expect(result.failedCheckId).toBeNull();
  });

  it("항목1 회귀: 선박도 결제일이 출장기간 밖이어도 날짜로는 반려하지 않는다", () => {
    const result = verifyTransport({
      mode: "SHIP",
      ocrStatus: "DONE",
      ocrText: "연안여객선 탑승권\n부산항 - 제주항\n좌석등급: 일반실\n결제일 2026-06-30\n운임 45,000원\n영수증",
      ocrAmountGuess: 45000,
      ocrDateGuess: d("2026-06-30T09:00:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(45000);
  });

  it("회귀 테스트: 숙박 영수증을 선박으로 잘못 제출 -> 업체유형 불일치로 불인정", () => {
    const result = verifyTransport({
      mode: "SHIP",
      ocrStatus: "DONE",
      ocrText:
        "부산 호텔 신라스테이\n부산광역시 해운대구\n2026-07-21 15:20:00\n디럭스룸 1박 115,000\n합계금액 115,000원\n영수증(RECEIPT)",
      ocrAmountGuess: 115000,
      ocrDateGuess: d("2026-07-21T15:20:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("not_transport_receipt");
  });

  it("회귀 테스트: 조식 영수증을 항공으로 잘못 제출 -> 업체유형 불일치로 불인정", () => {
    const result = verifyTransport({
      mode: "AIR",
      ocrStatus: "DONE",
      ocrText: "스타벅스 대전둔산점\n2026-07-21 07:35:12\n아메리카노 Tall 4,500\n합계금액 4,500원\n영수증",
      ocrAmountGuess: 4500,
      ocrDateGuess: d("2026-07-21T07:35:12"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("not_transport_receipt");
  });

  it("OCR 인식 실패: 불인정", () => {
    const result = verifyTransport({
      mode: "SHIP",
      ocrStatus: "FAILED",
      ocrText: null,
      ocrAmountGuess: null,
      ocrDateGuess: null,
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("ocr_unavailable");
  });

  it("금액이 추정값이면(키워드 없이 최댓값으로 추측) 자동 판정 보류(PENDING)", () => {
    const result = verifyTransport({
      mode: "AIR",
      ocrStatus: "DONE",
      ocrText: "국내선 항공권\n대전(청주) - 부산(김해)\n좌석등급: 이코노미\n승인번호 80000",
      ocrAmountGuess: 80000,
      ocrAmountIsEstimate: true,
      ocrDateGuess: d("2026-07-21T10:00:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("PENDING");
    expect(result.acceptedAmount).toBeNull();
    expect(result.failedCheckId).toBe("amount_estimated");
  });
});

/**
 * 항목 2/3: 교통은 사진 한 장 한 장이 별개의 결제 증빙이다. 예전에는 모든 사진의 텍스트를
 * 이어붙여 검사를 딱 한 번만 했기 때문에, 사진1이 항공권이면 사진2가 호텔 영수증이어도
 * 그 금액까지 교통비로 합산돼 승인됐다. 또 일부 사진이 OCR에 실패해도 "성공"으로 표시되고
 * 금액만 조용히 빠졌다.
 */
describe("verifyTransport - 사진별 개별 검증", () => {
  const airTicket1 = "국내선 항공권\n대전(청주) - 부산(김해)\n좌석등급: 이코노미\n운임 45,000원\n영수증";
  const airTicket2 = "국내선 항공권\n부산(김해) - 대전(청주)\n좌석등급: 이코노미\n운임 50,000원\n영수증";
  const hotelReceipt = "부산 호텔 신라스테이\n부산광역시 해운대구\n디럭스룸 1박 150,000\n합계금액 150,000원\n영수증";

  function photo(text: string | null, amount: number | null, ok = true) {
    return {
      ocrStatus: (ok ? "DONE" : "FAILED") as "DONE" | "FAILED",
      ocrText: text,
      ocrAmountGuess: amount,
    };
  }

  function run(photos: ReturnType<typeof photo>[]) {
    const succeeded = photos.filter((p) => p.ocrStatus === "DONE");
    return verifyTransport({
      mode: "AIR",
      ocrStatus: succeeded.length > 0 ? "DONE" : "FAILED",
      ocrText: photos.map((p) => p.ocrText ?? "(인식 불가)").join("\n\n"),
      ocrAmountGuess: succeeded.reduce((s, p) => s + (p.ocrAmountGuess ?? 0), 0),
      ocrDateGuess: d("2026-07-21T10:00:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
      photos,
    });
  }

  it("왕복 항공권 2장 모두 정상: 두 금액을 합산해 인정", () => {
    const result = run([photo(airTicket1, 45000), photo(airTicket2, 50000)]);
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(95000);
    expect(result.failedCheckId).toBeNull();
  });

  it("항목2 회귀: 항공권 + 실수로 섞인 호텔 영수증 -> 호텔 금액은 합산에서 제외하고 부분인정", () => {
    const result = run([photo(airTicket1, 45000), photo(hotelReceipt, 150000)]);
    expect(result.status).toBe("PARTIAL");
    // 예전에는 45,000 + 150,000 = 195,000이 교통비로 전액 승인됐다.
    expect(result.acceptedAmount).toBe(45000);
    expect(result.failedCheckId).toBe("partial_photo_excluded");
    expect(result.message).toContain("2번째 사진");
  });

  it("항목2 회귀: 좌석등급 위반 사진만 제외하고 나머지는 합산", () => {
    const business = "국내선 항공권\n대전(청주) - 부산(김해)\n좌석등급: 비즈니스석\n운임 200,000원\n영수증";
    const result = run([photo(airTicket1, 45000), photo(business, 200000)]);
    expect(result.status).toBe("PARTIAL");
    expect(result.acceptedAmount).toBe(45000);
    expect(result.failedCheckId).toBe("partial_photo_excluded");
  });

  it("항목3 회귀: 왕복 2장 중 1장 OCR 실패 -> 성공처럼 보이지 않게 부분인정 + 재시도 가능 표시", () => {
    const result = run([photo(airTicket1, 45000), photo(null, null, false)]);
    expect(result.status).toBe("PARTIAL");
    expect(result.acceptedAmount).toBe(45000);
    // 화면에서 "다시 인식 시도" 버튼을 띄우는 id다.
    expect(result.failedCheckId).toBe("partial_ocr_failure");
    expect(result.message).toContain("다시 인식 시도");
  });

  it("사진 전부가 교통 영수증이 아니면 기존처럼 업체유형 불일치로 불인정", () => {
    const result = run([photo(hotelReceipt, 150000), photo(hotelReceipt, 120000)]);
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("not_transport_receipt");
  });

  it("사진 전부 OCR 실패: 인식 불가로 불인정", () => {
    const result = run([photo(null, null, false), photo(null, null, false)]);
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("ocr_unavailable");
  });

  it("사진 1장만 있을 때는 기존 단일 판정과 동일하게 동작", () => {
    const result = run([photo(airTicket1, 45000)]);
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(45000);
  });
});

describe("verifyLodging", () => {
  const busanReceiptText =
    "부산 호텔 신라스테이\n사업자번호 111-22-33333\n부산광역시 해운대구\n2026-07-21 15:20:00\n\n디럭스룸 1박 115,000\n신용카드 결제\n\n합계금액 115,000원\n\n영수증(RECEIPT)";

  it("정상 케이스(부산 출장 + 부산 영수증 + 출장기간 내): 인정", () => {
    const result = verifyLodging({
      ocrStatus: "DONE",
      ocrText: busanReceiptText,
      ocrAmountGuess: 115000,
      ocrDateGuess: d("2026-07-21T15:20:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ["부산"],
      nights: 1,
    });
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(115000);
  });

  it("결제일이 출장기간 밖(7/25, OTA 사전결제 등): 날짜는 검사하지 않으므로 장소만 맞으면 인정", () => {
    // 숙박은 OTA로 출장 전에 미리 예약·결제하는 게 정상이라(2026-08-05 결정), 결제일이
    // 출장기간 밖이어도 더 이상 trip_date_mismatch로 불인정하지 않는다. 교통(항공/선박)에
    // 2026-08-04에 적용한 것과 동일한 예외.
    const result = verifyLodging({
      ocrStatus: "DONE",
      ocrText: "부산 호텔\n부산광역시\n2026-07-25 15:20:00\n합계금액 115,000원\n영수증(RECEIPT)",
      ocrAmountGuess: 115000,
      ocrDateGuess: d("2026-07-25T15:20:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ["부산"],
      nights: 1,
    });
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(115000);
  });

  it("금액 초과: 120,000원 상한까지만 부분인정", () => {
    const result = verifyLodging({
      ocrStatus: "DONE",
      ocrText: "부산 호텔\n부산광역시\n2026-07-21 15:20:00\n합계금액 180,000원\n영수증(RECEIPT)",
      ocrAmountGuess: 180000,
      ocrDateGuess: d("2026-07-21T15:20:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ["부산"],
      nights: 1,
    });
    expect(result.status).toBe("PARTIAL");
    expect(result.acceptedAmount).toBe(120000);
    expect(result.failedCheckId).toBe("amount_cap");
  });

  it("영수증 문구 없음(메모): 불인정", () => {
    const result = verifyLodging({
      ocrStatus: "DONE",
      ocrText: "메모\n부산 출장 중 숙소 후보\n신라스테이 - 1박 견적 110,000원 정도\n아직 예약 안 함",
      ocrAmountGuess: 110000,
      ocrDateGuess: null,
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ["부산"],
      nights: 1,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("not_a_receipt");
  });

  it("회귀 테스트: '대구' 출장에 '해운대구'(부산) 영수증 -> 장소불일치로 불인정", () => {
    // 버그였던 케이스: "대구"가 "해운대구"의 부분 문자열로 오매칭되어 통과해버렸던 것을 수정함.
    const result = verifyLodging({
      ocrStatus: "DONE",
      ocrText: busanReceiptText,
      ocrAmountGuess: 115000,
      ocrDateGuess: d("2026-07-21T15:20:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ["대구"],
      nights: 1,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("location_mismatch");
  });

  it("회귀 테스트: '부산'은 '부산광역시'처럼 접미사가 붙어도 정상 매칭", () => {
    const result = verifyLodging({
      ocrStatus: "DONE",
      ocrText: busanReceiptText,
      ocrAmountGuess: 115000,
      ocrDateGuess: d("2026-07-21T15:20:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ["부산"],
      nights: 1,
    });
    expect(result.status).not.toBe("REJECTED");
  });

  it("OCR 인식 실패: 불인정", () => {
    const result = verifyLodging({
      ocrStatus: "FAILED",
      ocrText: null,
      ocrAmountGuess: null,
      ocrDateGuess: null,
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ["부산"],
      nights: 1,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("ocr_unavailable");
  });

  it("3박 출장, 총액 40만원(1박당 12만원 초과): 3박 상한(36만원)까지만 부분인정", () => {
    const result = verifyLodging({
      ocrStatus: "DONE",
      ocrText: "부산 호텔\n부산광역시\n2026-07-21 15:20:00\n합계금액 400,000원\n영수증(RECEIPT)",
      ocrAmountGuess: 400000,
      ocrDateGuess: d("2026-07-21T15:20:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ["부산"],
      nights: 3,
    });
    expect(result.status).toBe("PARTIAL");
    expect(result.acceptedAmount).toBe(360000);
    expect(result.failedCheckId).toBe("amount_cap");
  });

  it("3박 출장, 총액 30만원(1박당 10만원, 상한 이내): 전액 인정", () => {
    const result = verifyLodging({
      ocrStatus: "DONE",
      ocrText: "부산 호텔\n부산광역시\n2026-07-21 15:20:00\n합계금액 300,000원\n영수증(RECEIPT)",
      ocrAmountGuess: 300000,
      ocrDateGuess: d("2026-07-21T15:20:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ["부산"],
      nights: 3,
    });
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(300000);
  });

  it("금액이 추정값이면(키워드 없이 최댓값으로 추측) 자동 판정 보류(PENDING)", () => {
    const result = verifyLodging({
      ocrStatus: "DONE",
      ocrText: "부산 호텔\n부산광역시\n2026-07-21 15:20:00\n승인번호 115000\n영수증(RECEIPT)",
      ocrAmountGuess: 115000,
      ocrAmountIsEstimate: true,
      ocrDateGuess: d("2026-07-21T15:20:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ["부산"],
      nights: 1,
    });
    expect(result.status).toBe("PENDING");
    expect(result.acceptedAmount).toBeNull();
    expect(result.failedCheckId).toBe("amount_estimated");
  });
});

/**
 * 항목 7: "한 번의 업로드에 서로 다른 여러 건의 숙박 문서가 섞였는가"만 본다.
 * 사업자등록번호 개수만으로 판단하면, 호텔 + 결제대행사(PG) + 카드사 번호가 함께 찍히는
 * 정상적인 단일 OTA 예약도 오반려된다 - 그래서 "사업자번호 3개 이상" 그리고 "서로 다른
 * 날짜 2개 이상"이 동시에 잡힐 때만 반려한다.
 */
describe("verifyLodging - 여러 건 혼합 감지 (2단계 신호)", () => {
  const base = {
    ocrStatus: "DONE" as const,
    ocrDateGuess: d("2026-07-21T15:20:00"),
    tripStartDate: TRIP_START,
    tripEndDate: TRIP_END,
    tripLocations: ["부산"],
    nights: 1,
  };

  it("정상적인 단일 OTA 예약(사업자번호 3개 + 체크인 날짜 1개): 반려하지 않는다", () => {
    const result = verifyLodging({
      ...base,
      ocrText: [
        "Hotels.com 예약확인서",
        "숙소: 부산 신라스테이 / 사업자등록번호 111-22-33333",
        "판매자: 호텔스닷컴 코리아 사업자등록번호 222-33-44444",
        "결제대행: 토스페이먼츠 사업자등록번호 333-44-55555",
        "체크인 2026-07-21 / 1박",
        "합계금액 115,000원",
        "영수증(RECEIPT)",
      ].join("\n"),
      ocrAmountGuess: 115000,
    });
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(115000);
  });

  it("실제 사고 사례(사업자번호 5개 + 서로 다른 체크인 날짜 여러 개): 여러 건 혼합으로 반려", () => {
    const result = verifyLodging({
      ...base,
      ocrText: [
        "부산 A호텔 사업자등록번호 111-22-33333 체크인 2026-07-21 합계금액 100,000원",
        "부산 B호텔 사업자등록번호 222-33-44444 체크인 2026-07-22 합계금액 110,000원",
        "부산 C호텔 사업자등록번호 333-44-55555 체크인 2026-07-23 합계금액 120,000원",
        "부산 D호텔 사업자등록번호 444-55-66666 체크인 2026-07-24 합계금액 130,000원",
        "부산 E호텔 사업자등록번호 555-66-77777 체크인 2026-07-25 합계금액 140,000원",
        "영수증(RECEIPT)",
      ].join("\n"),
      ocrAmountGuess: 100000,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("multiple_documents");
  });

  it("사업자번호는 2개뿐이고 날짜가 여러 개면(거래일시+체크아웃 등) 반려하지 않는다", () => {
    const result = verifyLodging({
      ...base,
      ocrText: [
        "부산 신라스테이 사업자등록번호 111-22-33333",
        "결제대행 사업자등록번호 222-33-44444",
        "체크인 2026-07-21 체크아웃 2026-07-22",
        "거래일시 2026-07-21 15:20:00",
        "합계금액 115,000원",
        "영수증(RECEIPT)",
      ].join("\n"),
      ocrAmountGuess: 115000,
    });
    expect(result.status).toBe("APPROVED");
  });

  it("날짜 표기가 '2026년 7월 21일' 형태여도 같은 하루로 묶어 센다", () => {
    const result = verifyLodging({
      ...base,
      ocrText: [
        "부산 신라스테이 사업자등록번호 111-22-33333",
        "PG 사업자등록번호 222-33-44444",
        "카드사 사업자등록번호 333-44-55555",
        "체크인 2026년 7월 21일",
        "거래일자 2026.07.21",
        "합계금액 115,000원",
        "영수증(RECEIPT)",
      ].join("\n"),
      ocrAmountGuess: 115000,
    });
    // 날짜 종류가 1개(7/21)뿐이라 두 번째 신호가 안 걸린다 -> 통과해야 한다.
    expect(result.status).toBe("APPROVED");
  });
});

/**
 * 항목 8: 숙박 상한은 영수증 1건이 아니라 출장 전체 기준이다. 예전에는 영수증마다 매번
 * "출장 전체 상한"과만 비교해서, 2박 출장(상한 24만원)에 20만원 영수증 2장을 나눠 올리면
 * 둘 다 그대로 승인돼 합계 40만원이 인정됐다.
 */
describe("verifyLodging - 출장 단위 누적 상한", () => {
  const base = {
    ocrStatus: "DONE" as const,
    ocrText: "부산 호텔\n부산광역시\n2026-07-21 15:20:00\n합계금액 200,000원\n영수증(RECEIPT)",
    ocrDateGuess: d("2026-07-21T15:20:00"),
    tripStartDate: TRIP_START,
    tripEndDate: TRIP_END,
    tripLocations: ["부산"],
    nights: 2, // 2박 -> 출장 전체 상한 240,000원
  };

  it("첫 번째 영수증 20만원: 상한(24만원) 이내라 전액 인정", () => {
    const result = verifyLodging({ ...base, ocrAmountGuess: 200000, alreadyAcceptedInTrip: 0 });
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(200000);
  });

  it("두 번째 영수증 20만원(이미 20만원 인정됨): 남은 한도 4만원까지만 부분인정", () => {
    const result = verifyLodging({ ...base, ocrAmountGuess: 200000, alreadyAcceptedInTrip: 200000 });
    expect(result.status).toBe("PARTIAL");
    // 예전에는 여기서도 200,000이 전액 승인돼 합계 400,000원이 인정됐다.
    expect(result.acceptedAmount).toBe(40000);
    expect(result.failedCheckId).toBe("amount_cap");
    expect(result.message).toContain("남은 한도");
  });

  it("상한을 이미 다 쓴 뒤의 영수증: 반려", () => {
    const result = verifyLodging({ ...base, ocrAmountGuess: 100000, alreadyAcceptedInTrip: 240000 });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("trip_cap_exhausted");
    expect(result.message).toContain("이미 숙박비 상한에 도달했습니다");
  });

  it("이미 인정된 금액이 상한을 넘어가 있어도(데이터 보정 등) 반려로 안전하게 처리", () => {
    const result = verifyLodging({ ...base, ocrAmountGuess: 100000, alreadyAcceptedInTrip: 999999 });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("trip_cap_exhausted");
  });

  it("alreadyAcceptedInTrip을 안 넘기면 기존(영수증 단건) 동작과 동일", () => {
    const result = verifyLodging({ ...base, ocrAmountGuess: 200000 });
    expect(result.status).toBe("APPROVED");
    expect(result.acceptedAmount).toBe(200000);
  });
});
