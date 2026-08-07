import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeReceipt, tripNights } from "@/lib/analyzeReceipt";
import type { ReceiptImage } from "@/lib/receiptOcr";
import { isHeic, heicToJpeg } from "@/lib/imageConvert";
import { sumAcceptedLodgingInTrip } from "@/lib/lodgingBudget";
import { assertTripOwner } from "@/lib/ownerGuard";
import { fetchPrivateBlob, PrivateBlobFetchError } from "@/lib/blobFetch";
import { toReceiptItem } from "@/lib/receipt";

const IMAGE_FETCH_TIMEOUT_MS = 15_000;

export const maxDuration = 60;

function mimeFromImagePath(imagePath: string): string {
  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

/**
 * 같은 원본 문서에서 렌더링된 PDF 페이지들을 다시 하나로 묶기 위한 키.
 * 저장 파일명이 "{문서id}-p{페이지번호}.png"면 그 문서id를, 아니면 null(=사진 1장 = 문서 1개)을 준다.
 * DB 스키마를 바꾸지 않고 파일 경로만으로 그룹을 복원하기 위한 방식이라, 이 규칙이 없던 기존
 * 영수증은 예전처럼 사진 1장 = 1건으로 취급된다.
 */
function pdfDocumentKey(imagePath: string): string | null {
  const filename = imagePath.split("?")[0].split("/").pop() ?? "";
  const m = filename.match(/^(.+)-p\d+\.png$/i);
  return m ? m[1] : null;
}

/**
 * 저장된 사진들을 다시 업로드하지 않고 그대로 재사용해 OCR/판정만 다시 실행한다.
 * 무료 LLM 티어가 일시적으로 혼잡(429)해 "인식 불가"로 끝난 경우, 사용자가 재촬영/재업로드
 * 없이 버튼 한 번으로 재시도할 수 있게 하기 위함.
 *
 * PDF는 이제 모든 페이지를 Blob에 저장하므로 재분석에서도 전 페이지를 그대로 다시 쓴다
 * (예전에는 1페이지만 남아 2페이지의 결제내역을 잃고 판정이 뒤집혔다). 같은 PDF에서 나온
 * 페이지들은 하나의 문서로 묶어야 교통(사진별 합산)에서 페이지가 각각의 결제 건으로
 * 중복 합산되지 않는다.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: {
      images: { orderBy: { order: "asc" } },
      trip: { include: { stops: { orderBy: { order: "asc" } } } },
    },
  });
  if (!receipt) {
    return NextResponse.json({ error: "영수증을 찾을 수 없습니다." }, { status: 404 });
  }
  const ownerError = await assertTripOwner(receipt.trip.ownerEmail);
  if (ownerError) {
    return NextResponse.json({ error: ownerError.error }, { status: ownerError.status });
  }
  if (receipt.images.length === 0) {
    return NextResponse.json({ error: "첨부된 사진이 없습니다." }, { status: 400 });
  }
  // 자동정산을 안 쓰는 출장은 애초에 OCR/판정을 안 하니 "다시 인식"할 대상이 없다. UI에도
  // 이 경우 버튼 자체가 안 뜨지만(failedCheckId가 null), 직접 호출을 막기 위한 방어 코드.
  if (!receipt.trip.autoSettlement) {
    return NextResponse.json(
      { error: "자동정산을 사용하지 않는 출장은 다시 인식할 필요가 없습니다." },
      { status: 400 }
    );
  }

  const photoGroups: ReceiptImage[][] = [];
  const groupIndexByKey = new Map<string, number>();
  for (const img of receipt.images) {
    let image: ReceiptImage;
    try {
      let buffer = await fetchPrivateBlob(img.path, IMAGE_FETCH_TIMEOUT_MS);
      let mimeType = mimeFromImagePath(img.path);
      // 서버 변환을 도입하기 전에 올라간 HEIC 사진은 그대로는 OCR에 못 넘긴다 - 여기서 변환한다.
      if (isHeic(mimeType, img.path)) {
        buffer = await heicToJpeg(buffer);
        mimeType = "image/jpeg";
      }
      image = { buffer, mimeType };
    } catch (err) {
      const timedOut = err instanceof PrivateBlobFetchError && err.timedOut;
      if (timedOut) {
        return NextResponse.json(
          { error: "저장된 이미지를 불러오는 데 시간이 너무 오래 걸렸습니다. 잠시 후 다시 시도해 주세요." },
          { status: 504 }
        );
      }
      console.error("Failed to reload stored receipt image:", err);
      return NextResponse.json({ error: "저장된 이미지 파일을 찾을 수 없습니다." }, { status: 404 });
    }

    const docKey = pdfDocumentKey(img.path);
    const existingGroup = docKey !== null ? groupIndexByKey.get(docKey) : undefined;
    if (existingGroup !== undefined) {
      photoGroups[existingGroup].push(image);
    } else {
      if (docKey !== null) groupIndexByKey.set(docKey, photoGroups.length);
      photoGroups.push([image]);
    }
  }

  const trip = receipt.trip;
  const tripStartDate = trip.startDate.toISOString();
  const tripEndDate = trip.endDate.toISOString();
  const allLocations = trip.stops.map((s) => s.location);
  const nonDepartureLocations = trip.stops.filter((s) => s.type !== "DEPARTURE").map((s) => s.location);

  // 이 영수증 자신의 기존 인정금액은 반드시 제외해야 한다 - 포함하면 재분석할 때마다
  // 자기 금액이 자기 한도에서 깎여 금액이 계속 줄어든다.
  const lodgingAlreadyAcceptedInTrip =
    receipt.category === "LODGING" ? await sumAcceptedLodgingInTrip(trip.id, receipt.id) : 0;

  const analysis = await analyzeReceipt({
    photos: photoGroups,
    category: receipt.category,
    transportMode: receipt.transportMode,
    tripStartDate,
    tripEndDate,
    tripLocationsAll: allLocations,
    tripLocationsNonDeparture: nonDepartureLocations,
    nights: tripNights(trip),
    lodgingAlreadyAcceptedInTrip,
    autoSettlement: trip.autoSettlement,
  });

  const updated = await prisma.receipt.update({
    where: { id },
    data: {
      ocrStatus: analysis.ocrStatus,
      ocrText: analysis.ocrText,
      ocrAmountGuess: analysis.ocrAmountGuess,
      ocrDateGuess: analysis.ocrDateGuess,
      ocrMerchantGuess: analysis.ocrMerchantGuess,
      ocrModel: analysis.ocrModel,
      verdictStatus: analysis.verdict.status,
      verdictAmount: analysis.verdict.acceptedAmount,
      verdictMessage: analysis.verdict.message,
      verdictFailedCheck: analysis.verdict.failedCheckId,
      verdictRegulationRef: analysis.verdict.regulationRef,
    },
    include: { images: { orderBy: { order: "asc" } } },
  });

  // 원본 Blob URL(path/thumbPath)은 클라이언트로 보내지 않는다 - 화면은 항상
  // /api/receipts/image/{id} 프록시로만 사진을 받는다.
  return NextResponse.json({ receipt: toReceiptItem(updated) });
}
