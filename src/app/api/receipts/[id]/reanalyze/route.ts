import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeReceipt, tripNights } from "@/lib/analyzeReceipt";
import type { ReceiptImage } from "@/lib/receiptOcr";

function mimeFromImagePath(imagePath: string): string {
  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

/**
 * 저장된 사진들을 다시 업로드하지 않고 그대로 재사용해 OCR/판정만 다시 실행한다.
 * 무료 LLM 티어가 일시적으로 혼잡(429)해 "인식 불가"로 끝난 경우, 사용자가 재촬영/재업로드
 * 없이 버튼 한 번으로 재시도할 수 있게 하기 위함. (PDF는 저장 시 첫 페이지만 남기므로 재분석도
 * 그 1장만 재사용한다.)
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
  if (receipt.images.length === 0) {
    return NextResponse.json({ error: "첨부된 사진이 없습니다." }, { status: 400 });
  }

  const photoGroups: ReceiptImage[][] = [];
  for (const img of receipt.images) {
    try {
      const res = await fetch(img.path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      photoGroups.push([{ buffer, mimeType: mimeFromImagePath(img.path) }]);
    } catch {
      return NextResponse.json({ error: "저장된 이미지 파일을 찾을 수 없습니다." }, { status: 404 });
    }
  }

  const trip = receipt.trip;
  const tripStartDate = trip.startDate.toISOString();
  const tripEndDate = trip.endDate.toISOString();
  const allLocations = trip.stops.map((s) => s.location);
  const nonDepartureLocations = trip.stops.filter((s) => s.type !== "DEPARTURE").map((s) => s.location);

  const analysis = await analyzeReceipt({
    photos: photoGroups,
    category: receipt.category,
    transportMode: receipt.transportMode,
    tripStartDate,
    tripEndDate,
    tripLocationsAll: allLocations,
    tripLocationsNonDeparture: nonDepartureLocations,
    nights: tripNights(trip),
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

  return NextResponse.json({ receipt: updated });
}