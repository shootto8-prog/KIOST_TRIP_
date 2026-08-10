import { describe, it, expect } from "vitest";
import {
  buildTransportCell,
  countAndAmount,
  amountOrDash,
  countOrDash,
  tripTotalDays,
  formatBreakfastSettlement,
  formatTransportSettlement,
  computeBreakfastSettlementTotal,
  exceedsLodgingIntranetThreshold,
} from "./settlementFormat";

describe("countAndAmount", () => {
  it("건수가 0이면 대시를 반환한다", () => {
    expect(countAndAmount(0, 0)).toBe("-");
  });
  it("금액이 있으면 확인금액과 함께 표기한다", () => {
    expect(countAndAmount(2, 15000)).toBe("2건 제출, 확인금액 15,000원");
  });
  it("금액이 0이면 건수만 표기한다", () => {
    expect(countAndAmount(2, 0)).toBe("2건 제출");
  });
});

describe("amountOrDash / countOrDash", () => {
  // amountOrDash는 PDF(사내 업무망 표기 맞춤)에서만 쓰여 "원" 단위를 안 붙인다(2026-08-10).
  it("amountOrDash는 0원이면 대시", () => {
    expect(amountOrDash(0)).toBe("-");
    expect(amountOrDash(1000)).toBe("1,000");
  });
  it("countOrDash는 0건이면 대시", () => {
    expect(countOrDash(0, "건")).toBe("-");
    expect(countOrDash(3, "건")).toBe("3건");
  });
});

describe("buildTransportCell", () => {
  it("항목이 없으면 대시를 반환한다", () => {
    expect(buildTransportCell([], true)).toBe("-");
  });

  it("자동정산 사용 - 항공/선박 금액을 합산한다", () => {
    const items = [
      { transportMode: "AIR", verdictAmount: 100000 },
      { transportMode: "SHIP", verdictAmount: 20000 },
    ];
    expect(buildTransportCell(items, true)).toBe("120,000원");
  });

  it("자동정산 사용 - 정액정산(고속철도/승용/버스) 구간 요금도 합산에 포함된다(2026-08-10)", () => {
    const items = [
      { transportMode: "RAIL", verdictAmount: 37100 },
      { transportMode: "BUS", verdictAmount: 22500 },
    ];
    expect(buildTransportCell(items, true)).toBe("59,600원, 고속철도, 버스");
  });

  it("자동정산 미사용 - 항공/선박은 건수+확인금액을 보여준다", () => {
    const items = [{ transportMode: "AIR", verdictAmount: 100000 }];
    expect(buildTransportCell(items, false)).toBe("1건 제출, 확인금액 100,000원");
  });

  it("자동정산 미사용 - 정액정산 항목도 이제 건수+확인금액에 포함된다", () => {
    const items = [
      { transportMode: "RAIL", verdictAmount: 37100 },
      { transportMode: "RAIL", verdictAmount: 8400 },
    ];
    expect(buildTransportCell(items, false)).toBe("2건 제출, 확인금액 45,500원, 고속철도");
  });

  it("렌트/동승으로 0원 처리된 승용 건도 태그는 남는다", () => {
    const items = [{ transportMode: "PRIVATE_CAR", verdictAmount: 0 }];
    expect(buildTransportCell(items, true)).toBe("승용(렌트,동승)");
  });
});

describe("tripTotalDays", () => {
  it("당일 출장은 1일이다", () => {
    expect(tripTotalDays("2026-08-01", "2026-08-01")).toBe(1);
  });
  it("1박2일 출장은 2일이다", () => {
    expect(tripTotalDays("2026-08-01", "2026-08-02")).toBe(2);
  });
  it("3박4일 출장은 4일이다", () => {
    expect(tripTotalDays("2026-08-01", "2026-08-04")).toBe(4);
  });
});

describe("formatBreakfastSettlement", () => {
  // 표기(곱셈 기호 "*", 숫자 뒤 "원" 없음, 마지막 항 설명 괄호 없음)는 사내 업무망 산식
  // 표기 그대로다 - 다듬지 않는다(2026-08-10).
  it("1일차 조식비를 제외하고 앱 인정금액을 더한 산식 문자열을 만든다", () => {
    expect(formatBreakfastSettlement(2, 15000)).toBe("90,000*2일 - 15,000(1일차 조식비 제외) + 15,000");
  });
  it("앱에 등록된 조식이 없으면(0원) 마지막 + 0 항은 아예 안 붙인다", () => {
    expect(formatBreakfastSettlement(1, 0)).toBe("45,000*1일 - 15,000(1일차 조식비 제외)");
  });
  it("식비공제(N식)를 선택하면 산식에 항이 추가된다", () => {
    expect(formatBreakfastSettlement(2, 15000, 2)).toBe(
      "90,000*2일 - 15,000(1일차 조식비 제외) - 30,000(식비공제·2식) + 15,000"
    );
  });
  it("식비공제가 0식이면(기본값) 항을 아예 안 넣는다", () => {
    expect(formatBreakfastSettlement(2, 15000, 0)).toBe("90,000*2일 - 15,000(1일차 조식비 제외) + 15,000");
  });
});

describe("computeBreakfastSettlementTotal", () => {
  it("산식과 같은 값을 숫자로 계산한다", () => {
    expect(computeBreakfastSettlementTotal(2, 15000)).toBe(90000 - 15000 + 15000);
  });
  it("식비공제(N식)만큼 추가로 빠진다", () => {
    expect(computeBreakfastSettlementTotal(2, 15000, 2)).toBe(90000 - 15000 - 30000 + 15000);
  });
  it("앱 인정금액이 0이어도 기본액-공제액은 남는다", () => {
    expect(computeBreakfastSettlementTotal(1, 0)).toBe(30000);
  });
});

describe("formatTransportSettlement", () => {
  it("항목이 없으면 대시를 반환한다", () => {
    expect(formatTransportSettlement([])).toBe("-");
  });
  it("여러 건이면 + 로 이어붙인다(원 단위 없이)", () => {
    expect(formatTransportSettlement([20000, 15000, 8900])).toBe("20,000 + 15,000 + 8,900");
  });
  it("한 건이면 그 금액만 보여준다", () => {
    expect(formatTransportSettlement([37100])).toBe("37,100");
  });
});

describe("exceedsLodgingIntranetThreshold", () => {
  // 사내 시스템 기준: 영수증 개별이 아니라 "출장 전체 숙박 합계 ÷ 전체 박수"만 본다(2026-08-10).
  it("3박 18만원(1박 6만원)은 기준(80,000원) 미달이라 false", () => {
    expect(exceedsLodgingIntranetThreshold(180000, 3)).toBe(false);
  });
  it("호텔을 나눠 2건으로 올려도 합계 기준으로 정확하다(3박 30만+2박 14만=5박 44만=1박 8.8만)", () => {
    expect(exceedsLodgingIntranetThreshold(300000 + 140000, 5)).toBe(true);
  });
  it("1박 90,000원은 초과라 true", () => {
    expect(exceedsLodgingIntranetThreshold(90000, 1)).toBe(true);
  });
  it("정확히 80,000원이면 초과가 아니라 false", () => {
    expect(exceedsLodgingIntranetThreshold(80000, 1)).toBe(false);
  });
});
