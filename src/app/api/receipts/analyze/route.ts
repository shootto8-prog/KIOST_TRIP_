import { NextRequest, NextResponse } from "next/server";
import { analyzeReceipt, tripNights } from "@/lib/analyzeReceipt";
import type { ReceiptImage } from "@/lib/receiptOcr";

/**
 * 무상태(stateless) OCR/판정 라우트 - 로컬 우선 전환 이후 서버가 하는 유일한 "영수증 판정"
 * 역할이다. DB/Blob 저장은 전혀 하지 않는다 - 클라이언트가 이미 IndexedDB에 사진을 갖고 있고,
 * 여기서는 판정 결과만 받아 클라이언트가 직접 localDb에 저장한다.
 *
 * autoSettlement=false(수동입력, 기본값)면 photos를 아예 안 보내도 된다 - verifyBreakfastManual/
 * verifyTransportManual/verifyLodgingManual은 사진 바이트를 전혀 쓰지 않으므로 이 경로에서는
 * 사진이 네트워크에 실리지 않는다. autoSettlement=true(자동정산 옵션)일 때만 사진이 여기로
 * 전송되고, analyzeReceipt() 내부에서 OpenRouter(외부 LLM)로 넘어간다 - 사용자가 그 기능을
 * 직접 켰을 때만 일어나는, 이미 안내된 예외다.
 */
export const maxDuration = 60;

const CATEGORIES = ["BREAKFAST", "TRANSPORT", "LODGING", "FIELD"] as const;
const TRANSPORT_MODES = ["SHIP", "AIR", "RAIL", "PRIVATE_CAR", "BUS"] as const;

type PhotoInput = { base64: string; mimeType: string };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const {
    category,
    transportMode,
    tripStartDate,
    tripEndDate,
    tripLocationsAll,
    tripLocationsNonDeparture,
    lodgingAlreadyAcceptedInTrip,
    autoSettlement,
    manualAmount,
    manualDatetime,
    photos,
  } = body as {
    category?: string;
    transportMode?: string | null;
    tripStartDate?: string;
    tripEndDate?: string;
    tripLocationsAll?: string[];
    tripLocationsNonDeparture?: string[];
    lodgingAlreadyAcceptedInTrip?: number;
    autoSettlement?: boolean;
    manualAmount?: number | null;
    manualDatetime?: string | null;
    photos?: PhotoInput[][];
  };

  if (typeof category !== "string" || !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json({ error: "유효하지 않은 항목입니다." }, { status: 400 });
  }
  if (
    transportMode != null &&
    !TRANSPORT_MODES.includes(transportMode as (typeof TRANSPORT_MODES)[number])
  ) {
    return NextResponse.json({ error: "유효하지 않은 교통수단입니다." }, { status: 400 });
  }
  if (typeof tripStartDate !== "string" || typeof tripEndDate !== "string") {
    return NextResponse.json({ error: "출장 기간 정보가 필요합니다." }, { status: 400 });
  }

  const photoGroups: ReceiptImage[][] = (photos ?? []).map((group) =>
    group.map((p) => ({ buffer: Buffer.from(p.base64, "base64"), mimeType: p.mimeType }))
  );

  try {
    const analysis = await analyzeReceipt({
      photos: photoGroups,
      category: category as (typeof CATEGORIES)[number],
      transportMode: (transportMode as (typeof TRANSPORT_MODES)[number] | null) ?? null,
      tripStartDate,
      tripEndDate,
      tripLocationsAll: tripLocationsAll ?? [],
      tripLocationsNonDeparture: tripLocationsNonDeparture ?? [],
      nights: tripNights({ startDate: new Date(tripStartDate), endDate: new Date(tripEndDate) }),
      lodgingAlreadyAcceptedInTrip: lodgingAlreadyAcceptedInTrip ?? 0,
      autoSettlement: Boolean(autoSettlement),
      manualAmount: manualAmount ?? null,
      manualDatetime: manualDatetime ?? null,
    });
    return NextResponse.json({ analysis });
  } catch (err) {
    console.error("Receipt analysis failed:", err);
    return NextResponse.json(
      { error: "영수증 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
