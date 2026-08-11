import { describe, it, expect } from "vitest";
import { buildSentMessage, buildEmailSubject, buildSimpleModeBodyLines, buildDetailedModeBodyLines } from "./emailBody";

const trip = { startDate: "2026-08-01", endDate: "2026-08-03", autoSettlement: true };

describe("emailBody message builders", () => {
  it("buildSentMessage: 어순이 달라 분기 확인", () => {
    expect(buildSentMessage("ko", "a@b.com")).toBe("a@b.com로 보냈습니다.");
    expect(buildSentMessage("en", "a@b.com")).toBe("Sent to a@b.com.");
  });

  it("buildEmailSubject: 접두어 + 기간", () => {
    expect(buildEmailSubject("ko", trip)).toContain("[정총무]국내여비 증빙서류 내역서");
    expect(buildEmailSubject("en", trip)).toContain("[Trip Expense Assistant] Domestic Travel Expense Report");
  });

  it("buildSimpleModeBodyLines: 건수/금액 표기가 locale별로 다르다", () => {
    const data = {
      byCategory: { BREAKFAST: [1], TRANSPORT: [], LODGING: [], FIELD: [] },
      sumByCategory: { BREAKFAST: 12000, TRANSPORT: 0, LODGING: 0, FIELD: 0 },
    };
    const ko = buildSimpleModeBodyLines("ko", data);
    const en = buildSimpleModeBodyLines("en", data);
    expect(ko.some((l) => l.includes("1건") && l.includes("12,000원"))).toBe(true);
    expect(en.some((l) => l.includes("1") && l.includes("12,000 KRW"))).toBe(true);
  });

  it("buildDetailedModeBodyLines: 자동정산이면 합계 줄이 붙는다", () => {
    const data = {
      byCategory: { BREAKFAST: [], TRANSPORT: [], LODGING: [], FIELD: [] },
      sumByCategory: { BREAKFAST: 0, TRANSPORT: 0, LODGING: 0, FIELD: 0 },
      transportItems: [],
    };
    const ko = buildDetailedModeBodyLines("ko", trip, data, 50000);
    const en = buildDetailedModeBodyLines("en", trip, data, 50000);
    expect(ko.some((l) => l.startsWith("합계"))).toBe(true);
    expect(en.some((l) => l.startsWith("Total"))).toBe(true);
  });
});
