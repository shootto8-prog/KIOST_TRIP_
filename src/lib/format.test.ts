import { describe, it, expect } from "vitest";
import { verdictDisplayLabel, isManuallyReviewedCategory, formatKrw, categoryLabel, stopTypeLabel, transportModeLabel } from "./format";

describe("isManuallyReviewedCategory", () => {
  it("조식/숙박은 검토 대상", () => {
    expect(isManuallyReviewedCategory("BREAKFAST")).toBe(true);
    expect(isManuallyReviewedCategory("LODGING")).toBe(true);
  });

  it("교통 - 선박/항공은 검토 대상, 정액정산(고속철도 등)은 아님", () => {
    expect(isManuallyReviewedCategory("TRANSPORT", "AIR")).toBe(true);
    expect(isManuallyReviewedCategory("TRANSPORT", "SHIP")).toBe(true);
    expect(isManuallyReviewedCategory("TRANSPORT", "RAIL")).toBe(false);
    expect(isManuallyReviewedCategory("TRANSPORT", "PRIVATE_CAR")).toBe(false);
    expect(isManuallyReviewedCategory("TRANSPORT", "BUS")).toBe(false);
  });

  it("현장사진은 검토 대상 아님", () => {
    expect(isManuallyReviewedCategory("FIELD")).toBe(false);
  });
});

describe("verdictDisplayLabel", () => {
  it("자동정산 사용이면 기존 인정/불인정 표현을 그대로 쓴다", () => {
    expect(verdictDisplayLabel("APPROVED", true, "BREAKFAST")).toBe("인정");
    expect(verdictDisplayLabel("REJECTED", true, "BREAKFAST")).toBe("불인정");
    expect(verdictDisplayLabel("PARTIAL", true, "LODGING")).toBe("부분인정");
  });

  it("자동정산 미사용 + 검토 대상 항목: 통과는 확인, 반려/부분인정은 확인요청", () => {
    expect(verdictDisplayLabel("APPROVED", false, "BREAKFAST")).toBe("확인");
    expect(verdictDisplayLabel("REJECTED", false, "BREAKFAST")).toBe("확인요청");
    expect(verdictDisplayLabel("PARTIAL", false, "LODGING")).toBe("확인요청");
    expect(verdictDisplayLabel("APPROVED", false, "TRANSPORT", "AIR")).toBe("확인");
    expect(verdictDisplayLabel("REJECTED", false, "TRANSPORT", "SHIP")).toBe("확인요청");
  });

  it("자동정산 미사용 + 검토 대상이 아닌 항목(현장사진, 정액정산 교통)은 항상 제출", () => {
    expect(verdictDisplayLabel("APPROVED", false, "FIELD")).toBe("제출");
    expect(verdictDisplayLabel("APPROVED", false, "TRANSPORT", "RAIL")).toBe("제출");
  });

  it("자동정산 미사용, 어떤 이유로든 판정 자체가 안 된 경우(SUBMITTED)는 제출로 폴백", () => {
    expect(verdictDisplayLabel("SUBMITTED", false, "BREAKFAST")).toBe("제출");
  });

  it("locale='en'이면 영어 표현을 쓴다", () => {
    expect(verdictDisplayLabel("APPROVED", true, "BREAKFAST", null, "en")).toBe("Approved");
    expect(verdictDisplayLabel("REJECTED", true, "BREAKFAST", null, "en")).toBe("Rejected");
    expect(verdictDisplayLabel("APPROVED", false, "BREAKFAST", null, "en")).toBe("Confirmed");
    expect(verdictDisplayLabel("REJECTED", false, "BREAKFAST", null, "en")).toBe("Needs Review");
    expect(verdictDisplayLabel("APPROVED", false, "FIELD", null, "en")).toBe("Submitted");
  });
});

describe("locale-aware label helpers", () => {
  it("formatKrw: en은 'N KRW' 형식", () => {
    expect(formatKrw(45000)).toBe("45,000원");
    expect(formatKrw(45000, "en")).toBe("45,000 KRW");
  });

  it("categoryLabel/stopTypeLabel/transportModeLabel: locale 기본값은 ko, en 지정 시 영어", () => {
    expect(categoryLabel("BREAKFAST")).toBe("조식");
    expect(categoryLabel("BREAKFAST", "en")).toBe("Breakfast");
    expect(stopTypeLabel("DEPARTURE", "en")).toBe("Departure");
    expect(transportModeLabel("RAIL", "en")).toBe("High-speed Rail");
  });
});
