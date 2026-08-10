import { describe, it, expect } from "vitest";
import { tripNights } from "./analyzeReceipt";

describe("tripNights", () => {
  it("당일 출장(시작일=종료일)은 0박이다", () => {
    const day = new Date("2026-07-21");
    expect(tripNights({ startDate: day, endDate: day })).toBe(0);
  });

  it("1박 2일 출장은 1박이다", () => {
    expect(
      tripNights({ startDate: new Date("2026-07-21"), endDate: new Date("2026-07-22") })
    ).toBe(1);
  });

  it("3박 4일 출장은 3박이다", () => {
    expect(
      tripNights({ startDate: new Date("2026-08-01"), endDate: new Date("2026-08-04") })
    ).toBe(3);
  });
});
