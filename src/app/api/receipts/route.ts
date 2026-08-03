import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import { randomUUID } from "crypto";
import type { ReceiptImage } from "@/lib/receiptOcr";
import { analyzeReceipt, tripNights } from "@/lib/analyzeReceipt";
import { renderAllPdfPagesToPng } from "@/lib/pdfToImage";

const CATEGORIES = ["BREAKFAST", "TRANSPORT", "LODGING", "FIELD"] as const;
const TRANSPORT_MODES = ["SHIP", "AIR", "RAIL", "PRIVATE_CAR", "BUS"] as const;
const SEAT_CLASSES = ["NORMAL", "RESTRICTED"] as const;

type UploadedBlob = { url: string; contentType: string };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const { tripId, category, transportMode: transportModeRaw, seatClass: seatClassRaw, blobs } = body as {
    tripId?: string;
    category?: string;
    transportMode?: string;
    seatClass?: string;
    blobs?: UploadedBlob[];
  };

  if (typeof tripId !== "string" || !tripId) {
    return NextResponse.json({ error: "tripId가 필요합니다." }, { status: 400 });
  }
  if (typeof category !== "string" || !CATEGORIES.includes(category as any)) {
    return NextResponse.json({ error: "유효하지 않은 항목입니다." }, { status: 400 });
  }
  if (!Array.isArray(blobs) || blobs.length === 0) {
    return NextResponse.json({ error: "사진 파일이 필요합니다." }, { status: 400 });
  }

  let transportMode: (typeof TRANSPORT_MODES)[number] | null = null;
  if (category === "TRANSPORT") {
    if (typeof transportModeRaw !== "string" || !TRANSPORT_MODES.includes(transportModeRaw as any)) {
      return NextResponse.json({ error: "교통수단을 선택해 주세요." }, { status: 400 });
    }
    transportMode = transportModeRaw as (typeof TRANSPORT_MODES)[number];
  }
  let seatClass: (typeof SEAT_CLASSES)[number] | null = null;
  if (typeof seatClassRaw === "string" && SEAT_CLASSES.includes(seatClassRaw as any)) {
    seatClass = seatClassRaw as (typeof SEAT_CLASSES)[number];
  }

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { stops: { orderBy: { order: "asc" } } },
  });
  if (!trip) {
    return NextResponse.json({ error: "출장 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  const categoryDir = category.toLowerCase();

  // 사진은 브라우저에서 이미 Vercel Blob으로 직접 업로드됐다(서버 요청 본문 4.5MB 제한을
  // 피하기 위함) - 여기서는 그 URL들을 다시 읽어와 OCR용 이미지 배열(PDF는 페이지별로 펼침)과
  // 최종 표시용 경로를 만든다.
  const photoGroups: ReceiptImage[][] = [];
  const savedPaths: string[] = [];
  for (const b of blobs) {
    if (typeof b?.url !== "string") {
      return NextResponse.json({ error: "업로드된 사진 정보가 올바르지 않습니다." }, { status: 400 });
    }
    let originalBuffer: Buffer;
    try {
      const res = await fetch(b.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      originalBuffer = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.error("Failed to fetch uploaded blob:", err);
      return NextResponse.json({ error: "업로드된 사진을 불러오지 못했습니다." }, { status: 400 });
    }

    const isPdf = b.contentType === "application/pdf" || /\.pdf$/i.test(b.url);
    let ocrImages: ReceiptImage[];

    if (isPdf) {
      let displayBuffer: Buffer;
      try {
        // PDF가 여러 페이지면(예: 1p 요약 + 2p 결제내역) 전 페이지를 전부 OCR에 넘겨야 뒷장 정보를
        // 놓치지 않는다. 저장/썸네일 표시는 1페이지만 쓴다.
        const pages = renderAllPdfPagesToPng(originalBuffer);
        ocrImages = pages.map((buf) => ({ buffer: buf, mimeType: "image/png" }));
        displayBuffer = pages[0];
      } catch (err) {
        console.error("PDF to image conversion failed:", err);
        return NextResponse.json(
          { error: "PDF 파일을 이미지로 변환하지 못했습니다. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다." },
          { status: 400 }
        );
      }
      // 원본으로 올라간 건 PDF 그대로라 화면에 미리보기가 안 된다 - 렌더링한 첫 페이지 PNG를
      // 별도 Blob으로 다시 올려 그걸 표시용 경로로 쓴다.
      const filename = `${randomUUID()}.png`;
      const pngBlob = await put(`uploads/${tripId}/${categoryDir}/${filename}`, displayBuffer, {
        access: "public",
        contentType: "image/png",
      });
      savedPaths.push(pngBlob.url);
    } else {
      ocrImages = [{ buffer: originalBuffer, mimeType: b.contentType }];
      savedPaths.push(b.url);
    }
    photoGroups.push(ocrImages);
  }

  const allLocations = trip.stops.map((s) => s.location);
  const nonDepartureLocations = trip.stops.filter((s) => s.type !== "DEPARTURE").map((s) => s.location);
  const tripStartDate = trip.startDate.toISOString();
  const tripEndDate = trip.endDate.toISOString();

  const analysis = await analyzeReceipt({
    photos: photoGroups,
    category: category as (typeof CATEGORIES)[number],
    transportMode,
    tripStartDate,
    tripEndDate,
    tripLocationsAll: allLocations,
    tripLocationsNonDeparture: nonDepartureLocations,
    nights: tripNights(trip),
  });

  const receipt = await prisma.receipt.create({
    data: {
      tripId,
      category: category as (typeof CATEGORIES)[number],
      transportMode,
      seatClass,
      images: { create: savedPaths.map((p, i) => ({ path: p, order: i })) },
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

  return NextResponse.json({ receipt });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  }
  await prisma.receipt.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const category = searchParams.get("category");
  if (!tripId) {
    return NextResponse.json({ error: "tripId가 필요합니다." }, { status: 400 });
  }
  const receipts = await prisma.receipt.findMany({
    where: {
      tripId,
      ...(category ? { category: category as any } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { images: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ receipts });
}