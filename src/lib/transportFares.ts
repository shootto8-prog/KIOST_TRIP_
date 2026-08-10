import fares from "@/data/transportFares.json";

/** 출장자 직급 - 고속철도(KTX) 요금은 직급에 따라 다르다(2026-08-10, TRANS/ktx.xls 참고). */
export type PositionGrade = "SENIOR" | "JUNIOR";

export const POSITION_GRADE_LABEL: Record<PositionGrade, string> = {
  SENIOR: "책임급",
  JUNIOR: "선임급 이하",
};

type FlatFareRoute = { route: string; fare: number };
type RailFareRoute = { route: string; fareSenior: number; fareJunior: number; source: "KTX" | "TRAIN" };

export type RouteSearchResult = {
  /** React key + 재선택 시 식별용 - 같은 구간이 KTX/기차로 중복 나올 수 있어 route만으론 안 됨. */
  key: string;
  route: string;
  /** 화면에 보여줄 표시 문구 - 고속철도는 "구간 (KTX)"/"구간 (기차)"로 출처를 구분한다. */
  label: string;
  fare: number;
};

const MAX_RESULTS = 20;

/**
 * 구간이 "출발지-도착지" 한 문자열이다 보니, 검색창 하나로는 "부산"만 쳐도 "OO-부산"/"부산-OO"가
 * 뒤섞여 나와 스크롤하며 일일이 비교해야 했다(2026-08-10 실사용 피드백). 출발/도착 두 칸으로
 * 나눠 받아 둘 다 채워지면 그 두 지명을 모두 포함하는 행만 남긴다 - 방향(어느 칸에 뭘 썼는지)은
 * 굳이 구분하지 않는다(편도 요금표의 실제 방향 라벨은 검색 결과에 그대로 표시되므로).
 */
function matchesRoute(route: string, from: string, to: string): boolean {
  const f = from.trim();
  const t = to.trim();
  if (!f && !t) return false;
  if (f && !route.includes(f)) return false;
  if (t && !route.includes(t)) return false;
  return true;
}

function searchFlat(list: FlatFareRoute[], from: string, to: string): RouteSearchResult[] {
  return list
    .filter((r) => matchesRoute(r.route, from, to))
    .slice(0, MAX_RESULTS)
    .map((r) => ({ key: r.route, route: r.route, label: r.route, fare: r.fare }));
}

/** 고속철도 메뉴는 KTX/일반기차 요금표를 함께 검색해, 실제 탄 편을 사용자가 고르게 한다. */
function searchRail(list: RailFareRoute[], from: string, to: string, grade: PositionGrade): RouteSearchResult[] {
  return list
    .filter((r) => matchesRoute(r.route, from, to))
    .slice(0, MAX_RESULTS)
    .map((r) => {
      const fare = grade === "SENIOR" ? r.fareSenior : r.fareJunior;
      const sourceLabel = r.source === "KTX" ? "KTX" : "일반기차";
      return { key: `${r.route}__${r.source}`, route: r.route, label: `${r.route} (${sourceLabel})`, fare };
    });
}

export function searchBusRoutes(from: string, to: string): RouteSearchResult[] {
  return searchFlat(fares.bus as FlatFareRoute[], from, to);
}

export function searchCarRoutes(from: string, to: string): RouteSearchResult[] {
  return searchFlat(fares.car as FlatFareRoute[], from, to);
}

export function searchRailRoutes(from: string, to: string, grade: PositionGrade): RouteSearchResult[] {
  return searchRail(fares.rail as RailFareRoute[], from, to, grade);
}
