import { describe, it, expect } from "vitest";
import { searchBusRoutes, searchCarRoutes, searchRailRoutes } from "./transportFares";

describe("transportFares", () => {
  it("출발/도착을 둘 다 입력하면 두 지명을 포함하는 구간만 나온다", () => {
    const results = searchBusRoutes("강릉", "서울");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.route.includes("강릉") && r.route.includes("서울"))).toBe(true);
    expect(results[0].fare).toBeGreaterThan(0);
  });

  it("출발만 입력해도 검색된다(한쪽만 채운 상태)", () => {
    const results = searchCarRoutes("강릉", "");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.route.includes("강릉"))).toBe(true);
  });

  it("도착만 입력해도 검색된다", () => {
    const results = searchCarRoutes("", "서울");
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.route.includes("서울"))).toBe(true);
  });

  it("존재하지 않는 구간은 빈 배열을 반환한다", () => {
    expect(searchBusRoutes("존재하지않는구간이름XYZ123", "")).toEqual([]);
  });

  it("둘 다 비어있으면 빈 배열을 반환한다(전체 목록 노출 방지)", () => {
    expect(searchBusRoutes("", "")).toEqual([]);
    expect(searchBusRoutes("   ", "   ")).toEqual([]);
  });

  it("고속철도는 책임급/선임급이하 요금이 다르게 나온다(KTX 기준)", () => {
    const senior = searchRailRoutes("강릉", "서울", "SENIOR");
    const junior = searchRailRoutes("강릉", "서울", "JUNIOR");
    const seniorKtx = senior.find((r) => r.label.includes("KTX"));
    const juniorKtx = junior.find((r) => r.label.includes("KTX"));
    expect(seniorKtx).toBeDefined();
    expect(juniorKtx).toBeDefined();
    expect(seniorKtx!.fare).not.toBe(juniorKtx!.fare);
  });

  it("고속철도 검색 결과는 KTX/일반기차를 함께 보여준다", () => {
    const results = searchRailRoutes("강릉", "경주", "JUNIOR");
    const sources = results.map((r) => r.label);
    expect(sources.some((l) => l.includes("KTX"))).toBe(true);
  });
});
