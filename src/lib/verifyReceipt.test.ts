import { describe, it, expect } from "vitest";
import { verifyBreakfast, verifyTransport, verifyLodging } from "./verifyReceipt";

/**
 * Phase 5 검증 스위트. Phase 4에서 실제 이미지 업로드로 한 번 수동 검증했던 시나리오를
 * 여기에 고정 OCR 텍스트 fixture로 옮겨, LLM/서버 호출 없이 몇 초 안에 반복 재검증할 수 있게 한다.
 * "사람 재확인 없이 자동 확정"이 성립하려면 이 스위트가 항상 통과해야 한다.
 *
 * 날짜 fixture는 항상 new Date(naiveLocalString).toISOString()로 만든다. verifyBreakfast는
 * Date의 로컬 getHours()/getMinutes()로 시각을 비교하므로, 인코딩(테스트 fixture 생성)과 디코딩
 * (verifyBreakfast 내부 비교)이 같은 방식으로 로컬 타임존을 쓰는 한 실행 환경의 타임존에
 * 관계없이 항상 같은 결과가 나온다 - 실제 운영 코드(route.ts)의 왕복 방식과 동일하다.
 *
 * 트립은 항상 "대전 -> 부산" (2026-07-21 ~ 2026-07-22)을 기준으로 한다. 조식/교통은 출장경로
 * 전체(대전+부산)를 장소 후보로 쓰고, 숙박은 기존 스펙대로 도착지/경유지(부산)만 후보로 쓴다.
 */

const TRIP_START = new Date("2026-07-21").toISOString();
const TRIP_END = new Date("2026-07-22").toISOString();
const ALL_LOCATIONS = ["대전", "부산"];

function d(localDateTime: string): string {
  return new Date(localDateTime).toISOString();
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

  it("OCR 인식 실패: 품목 확인 불가로 불인정", () => {
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

  it("항공, 출장기간 밖 날짜(7/25): 불인정", () => {
    const result = verifyTransport({
      mode: "AIR",
      ocrStatus: "DONE",
      ocrText: "국내선 항공권\n대전(청주) - 부산(김해)\n좌석등급: 이코노미\n2026-07-25 10:00\n운임 80,000원\n영수증",
      ocrAmountGuess: 80000,
      ocrDateGuess: d("2026-07-25T10:00:00"),
      tripStartDate: TRIP_START,
      tripEndDate: TRIP_END,
      tripLocations: ALL_LOCATIONS,
    });
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("trip_date_mismatch");
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

  it("출장기간 밖 날짜(7/25): 불인정", () => {
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
    expect(result.status).toBe("REJECTED");
    expect(result.failedCheckId).toBe("trip_date_mismatch");
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
});
