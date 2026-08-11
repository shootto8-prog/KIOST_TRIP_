import { NextRequest, NextResponse } from "next/server";
import { isNaverMapConfigured } from "@/lib/naverMapConfig";

/**
 * 현장사진 "네이버지도 인증하기" 버튼의 서버 프록시 - 네이버클라우드플랫폼 Client ID/Secret은
 * 브라우저에 절대 노출되면 안 되므로(누구나 우리 API 사용량을 훔쳐 쓸 수 있게 됨), 클라이언트는
 * 좌표만 이 라우트로 보내고 서버가 대신 네이버 API 두 개(Reverse Geocoding, Static Map)를
 * 호출한다. 다른 로컬화 이후 라우트들처럼 저장은 안 하는 상태 없는 중계다 - 받은 이미지를 그대로
 * 클라이언트에 돌려주면, 클라이언트가 여느 현장사진과 똑같이 IndexedDB에 저장한다.
 */
export const maxDuration = 30;

// 공식 문서 예제가 쓰는 naveropenapi.apigw.ntruss.com(구버전 "AI·NAVER API")는 이 프로젝트가
// 콘솔에서 발급받은 신규 "Maps" 상품 키로는 "구독이 필요합니다"(401, errorCode 210) 오류가
// 났다 - 실제로 직접 두 도메인을 다 호출해 비교해본 결과, 신규 Maps 상품은 이 도메인을 써야
// 한다(2026-08-11 실사용 확인).
const NCP_BASE = "https://maps.apigw.ntruss.com";
const NCP_TIMEOUT_MS = 10_000;

function ncpHeaders(): HeadersInit {
  return {
    "x-ncp-apigw-api-key-id": process.env.NAVER_MAPS_CLIENT_ID!,
    "x-ncp-apigw-api-key": process.env.NAVER_MAPS_CLIENT_SECRET!,
  };
}

type NcpRegion = { name: string };
type NcpReverseGeocodeResult = {
  name: string;
  region?: { area1?: NcpRegion; area2?: NcpRegion; area3?: NcpRegion; area4?: NcpRegion };
  land?: { name?: string; number1?: string; number2?: string };
};

/**
 * 도로명주소(roadaddr)를 우선 조립하고, 없으면 행정구역명(area1~3)만이라도 보여준다.
 * 주소를 못 구해도(네트워크 문제 등) null만 반환한다 - 지도 이미지 첨부가 핵심 기능이라
 * 주소 캡션은 실패해도 전체 요청이 죽으면 안 된다.
 */
function buildAddress(results: NcpReverseGeocodeResult[]): string | null {
  const road = results.find((r) => r.name === "roadaddr");
  const region = road?.region ?? results[0]?.region;
  const areaNames = [region?.area1?.name, region?.area2?.name, region?.area3?.name]
    .filter(Boolean)
    .join(" ");
  if (road?.land?.name) {
    const number = road.land.number2 && road.land.number2 !== "0"
      ? `${road.land.number1}-${road.land.number2}`
      : road.land.number1 ?? "";
    return [areaNames, road.land.name, number].filter(Boolean).join(" ").trim() || null;
  }
  return areaNames || null;
}

async function fetchAddress(lat: number, lng: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      coords: `${lng},${lat}`,
      sourcecrs: "EPSG:4326",
      output: "json",
      orders: "roadaddr,addr,legalcode",
    });
    const res = await fetch(`${NCP_BASE}/map-reversegeocode/v2/gc?${params}`, {
      headers: ncpHeaders(),
      signal: AbortSignal.timeout(NCP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.status?.code !== 0 || !Array.isArray(data?.results)) return null;
    return buildAddress(data.results);
  } catch (err) {
    console.error("네이버 Reverse Geocoding 실패:", err);
    return null;
  }
}

async function fetchStaticMap(lat: number, lng: number): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const markers = `type:d|size:mid|color:red|pos:${lng} ${lat}`;
  const params = new URLSearchParams({
    w: "640",
    h: "400",
    center: `${lng},${lat}`,
    level: "16",
    markers,
    format: "jpg",
  });
  const res = await fetch(`${NCP_BASE}/map-static/v2/raster?${params}`, {
    headers: ncpHeaders(),
    signal: AbortSignal.timeout(NCP_TIMEOUT_MS),
  });
  if (!res.ok) {
    console.error("네이버 Static Map 실패:", res.status, await res.text().catch(() => ""));
    return null;
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  return { bytes, mimeType: res.headers.get("content-type") ?? "image/jpeg" };
}

export async function POST(req: NextRequest) {
  if (!isNaverMapConfigured()) {
    return NextResponse.json({ error: "네이버지도 인증 기능이 아직 설정되지 않았습니다." }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "올바른 위치 좌표가 아닙니다." }, { status: 400 });
  }

  const [address, map] = await Promise.all([fetchAddress(lat, lng), fetchStaticMap(lat, lng)]);

  if (!map) {
    return NextResponse.json({ error: "지도 이미지를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }

  return NextResponse.json({
    address,
    imageBase64: map.bytes.toString("base64"),
    mimeType: map.mimeType,
  });
}
