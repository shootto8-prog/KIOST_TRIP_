import { describe, it, expect } from "vitest";
import { categoryDetailHeading, fieldPhotoHeading, countOrDash } from "./pdf";

describe("pdf message builders", () => {
  it("categoryDetailHeading: ko는 '건', en은 단복수 처리", () => {
    expect(categoryDetailHeading("ko", "교통", 3)).toBe("교통 세부내역 (3건)");
    expect(categoryDetailHeading("en", "Transport", 3)).toBe("Transport Details (3 items)");
    expect(categoryDetailHeading("en", "Transport", 1)).toBe("Transport Details (1 item)");
  });

  it("fieldPhotoHeading: ko/en 각각 카테고리 라벨 사전에서 가져온다", () => {
    expect(fieldPhotoHeading("ko", 2)).toBe("현장사진 (2건)");
    expect(fieldPhotoHeading("en", 2)).toBe("Field Photos (2 items)");
    expect(fieldPhotoHeading("en", 1)).toBe("Field Photos (1 item)");
  });

  it("countOrDash: 0이면 대시, ko는 접미사 있음, en은 숫자만", () => {
    expect(countOrDash("ko", 0)).toBe("-");
    expect(countOrDash("en", 0)).toBe("-");
    expect(countOrDash("ko", 3)).toBe("3건");
    expect(countOrDash("en", 3)).toBe("3");
  });
});
