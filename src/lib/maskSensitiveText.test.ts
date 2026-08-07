import { describe, it, expect } from "vitest";
import { maskSensitiveReceiptText } from "./maskSensitiveText";

describe("maskSensitiveReceiptText", () => {
  it("further masks a partially-masked card number, keeping the last 4 digits", () => {
    const out = maskSensitiveReceiptText("카드번호 9409-15**-****-0980");
    expect(out).toContain("****-****-****-0980");
    expect(out).not.toContain("9409");
    expect(out).not.toContain("15**");
  });

  it("masks a differently-grouped partially-masked card number", () => {
    const out = maskSensitiveReceiptText("791-8328-****-02*");
    expect(out).toBe("***-****-****-02*");
  });

  it("masks an approval number following the label, keeping the label text", () => {
    const out = maskSensitiveReceiptText("승인번호 9436 3836 (IC)");
    expect(out).toContain("승인번호");
    expect(out).toContain("(IC)");
    expect(out).not.toMatch(/\d/);
  });

  it("masks a single-run approval number", () => {
    const out = maskSensitiveReceiptText("승인번호 66810327");
    expect(out).toBe("승인번호 ********");
  });

  it("does not touch a business registration number (NNN-NN-NNNNN)", () => {
    const out = maskSensitiveReceiptText("380-15-00652");
    expect(out).toBe("380-15-00652");
  });

  it("does not touch a phone number", () => {
    const out = maskSensitiveReceiptText("033-575-5784");
    expect(out).toBe("033-575-5784");
  });

  it("does not touch a calendar date", () => {
    const out = maskSensitiveReceiptText("거래일자 2026/07/13 10:23:09");
    expect(out).toContain("2026/07/13");
  });

  it("leaves already fully-masked segments unchanged", () => {
    const out = maskSensitiveReceiptText("결제수단 **** **** **** ****");
    expect(out).toBe("결제수단 **** **** **** ****");
  });

  it("is a no-op on text with no sensitive patterns", () => {
    const text = "스타벅스 강남점\n합계 4,500원\n2026-07-13 09:12:00";
    expect(maskSensitiveReceiptText(text)).toBe(text);
  });

  it("masks a full multi-document receipt end-to-end without breaking unrelated fields", () => {
    const input = [
      "NICE페이먼츠",
      "매출전표 [고객용/가맹점용]",
      "이름 380-15-00652",
      "791-8328-****-02*",
      "거래일자 2026/07/13 10:23:09",
      "승인번호 9436 3836 (IC)",
    ].join("\n");
    const out = maskSensitiveReceiptText(input);
    expect(out).toContain("매출전표");
    expect(out).toContain("380-15-00652");
    expect(out).toContain("2026/07/13 10:23:09");
    expect(out).not.toContain("791-8328");
    expect(out).not.toContain("9436 3836");
  });
});
