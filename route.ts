import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { put, del } from "@vercel/blob";
import { randomUUID } from "crypto";
import type { ReceiptImage } from "@/lib/receiptOcr";
import { analyzeReceipt, tripNights } from "@/lib/analyzeReceipt";
import { renderAllPdfPagesToPng } from "@/lib/pdfToImage";
import { isHeic, heicToJpeg, toThumbnailJpeg } from "@/lib/imageConvert";
import { sumAcceptedLodgingInTrip } from "@/lib/lodgingBudget";
import { assertTripOwner } from "@/lib/ownerGuard";
import { fetchPrivateBlob, PrivateBlobFetchError } from "@/lib/blobFetch";
import { toReceiptItem } from "@/lib/receipt";
import { isFlatRateTransportMode } from "@/lib/verifyReceipt";

const CATEGORIES = ["BREAKFAST", "TRANSPORT", "LODGING", "FIELD"] as const;
const TRANSPORT_MODES = ["SHIP", "AIR", "RAIL", "PRIVATE_CAR", "BUS"] as const;
const SEAT_CLASSES = ["NORMAL", "RESTRICTED"] as const;

/** 원본 Blob을 다시 읽어오는 데 무한정 기다리지 않는다 (항목 6: 외부 호출 타임아웃). */
const BLOB_FETCH_TIMEOUT_MS = 15_000;

/**
 * OCR(무료 모델 재시도 포함) + Blob 왕복 + PDF 렌더링이 직렬로 쌓이면 플랫폼 기본 제한을
 * 넘길 수 있어 명시적으로 상한을 올려둔다.
 */
export const maxDuration = 60;

type UploadedBlob = { url: string; contentType: string };

/**
 * 요청 처리 도중 실패하면, 이 요청에서 이미 Blob에 올라간 파일들을 지운다.
 * 안 지우면 DB에 기록조차 없는 고아 파일이 무료 용량을 단조 증가로 잠식한다.
 */
async function cleanupBlobs(urls: string[]): Promise<void> {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    await del(unique);
  } catch (err) {
    // 정리 실패가 원래 에러 응답을 가리면 안 된다 - 로그만 남긴다.
    console.error("Failed to clean up orphaned blobs:", err);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const {
    tripId,
    category,
    transportMode: transportModeRaw,
    seatClass: seatClassRaw,
    blobs,
    manualAmount: manualAmountRaw,
    manualDatetime: manualDatetimeRaw,
  } = body as {
    tripId?: string;
    category?: string;
    transportMode?: string;
    seatClass?: string;
    blobs?: UploadedBlob[];
    manualAmount?: unknown;
    manualDatetime?: unknown;
  };

  if (typeof tripId !== "string" || !tripId) {
    return NextResponse.json({ error: "tripId가 필요합니다." }, { status: 400 });
  }
  if (!Array.isArray(blobs) || blobs.length === 0) {
    return NextResponse.json({ error: "사진 파일이 필요합니다." }, { status: 400 });
  }

  // 여기서부터의 모든 실패 경로는 이미 브라우저가 Blob에 올려둔 파일들을 정리하고 나가야 한다.
  const uploadedUrls = blobs.map((b) => (typeof b?.url === "string" ? b.url : "")).filter(Boolean);
  const generatedUrls: string[] = [];
  // PDF/HEIC 원본은 변환된 결과물(PNG/JPEG)로 완전히 대체되어 다시 쓰이지 않는다 - 요청이
  // 최종 성공하면 이 원본들도 지운다 (안 지우면 변환 성공 후에도 원본이 Blob에 영구히 남는다).
  const supersededUrls: string[] = [];
  const failWith = async (error: string, status: number) => {
    await cleanupBlobs([...uploadedUrls, ...generatedUrls]);
    return NextResponse.json({ error }, { status });
  };

  if (typeof category !== "string" || !CATEGORIES.includes(category as any)) {
    return failWith("유효하지 않은 항목입니다.", 400);
  }

  let transportMode: (typeof TRANSPORT_MODES)[number] | null = null;
  if (category === "TRANSPORT") {
    if (typeof transportModeRaw !== "string" || !TRANSPORT_MODES.includes(transportModeRaw as any)) {
      return failWith("교통수단을 선택해 주세요.", 400);
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
    return failWith("출장 정보를 찾을 수 없습니다.", 404);
  }
  const ownerError = await assertTripOwner(trip.ownerEmail);
  if (ownerError) {
    return failWith(ownerError.error, ownerError.status);
  }

  // 자동정산을 안 쓰는 출장은 실비 항목(조식/교통-선박·항공/숙박)에 금액을 사람이 직접 입력해야
  // 한다 - 현장사진과 정액정산 교통수단(고속철도/승용/버스)은 원래도 금액 개념이 없어 예외.
  // 조식은 규정상 05:00~10:00 시간대를 사람이 눈으로 확인해야 하므로 일시도 함께 받는다.
  // (GAS 버전의 수동입력 검증을 그대로 참고, 2026-08-07)
  let manualAmount: number | null = null;
  let manualDatetime: string | null = null;
  if (!trip.autoSettlement) {
    const isNonFlatTransport = category === "TRANSPORT" && !(transportMode && isFlatRateTransportMode(transportMode));
    const needsAmount = category !== "FIELD" && !(transportMode && isFlatRateTransportMode(transportMode));
    if (needsAmount) {
      const parsedAmount = typeof manualAmountRaw === "number" ? manualAmountRaw : Number(manualAmountRaw);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return failWith("금액을 올바르게 입력해 주세요.", 400);
      }
      manualAmount = Math.round(parsedAmount);
    }
    if (category === "BREAKFAST") {
      if (typeof manualDatetimeRaw !== "string" || !manualDatetimeRaw.trim()) {
        return failWith("결제 일시를 입력해 주세요.", 400);
      }
      manualDatetime = manualDatetimeRaw;
    }
    // 선박/항공은 규정상 좌석등급(class_restriction)을 확인해야 하므로 명시적 선택이 필요하다 -
    // 미선택(seatClass가 여기서 계속 null)을 "일반석"으로 조용히 간주하면 실제로는 제한 등급인데도
    // 통과시킬 위험이 있다. (GAS의 필수입력 검증 그대로 참고, 2026-08-07)
    if (isNonFlatTransport && !seatClass) {
      return failWith("좌석등급을 선택해 주세요.", 400);
    }
  }

  const categoryDir = category.toLowerCase();

  /**
   * 목록/그리드는 원본(휴대폰 사진 3~6MB)이 아니라 이 축소본만 받아야 한다 - 실패해도 화면
   * 표시용 원본(path)이 이미 있으니 썸네일 생성 실패로 업로드 전체를 막을 이유는 없다(썸네일 없는
   * 경우 프론트에서 path로 폴백한다).
   */
  async function makeThumbnail(buffer: Buffer, baseName: string): Promise<string | null> {
    try {
      const thumbBuffer = await toThumbnailJpeg(buffer);
      const thumbBlob = await put(`uploads/${tripId}/${categoryDir}/${baseName}-thumb.jpg`, thumbBuffer, {
        access: "private",
        contentType: "image/jpeg",
      });
      generatedUrls.push(thumbBlob.url);
      return thumbBlob.url;
    } catch (err) {
      console.error("Failed to generate/store thumbnail:", err);
      return null;
    }
  }

  // 사진은 브라우저에서 이미 Vercel Blob으로 직접 업로드됐다(서버 요청 본문 4.5MB 제한을
  // 피하기 위함) - 여기서는 그 URL들을 다시 읽어와 OCR용 이미지 배열(PDF는 페이지별로 펼침)과
  // 최종 표시용 경로(+그리드용 축소본)를 만든다.
  const photoGroups: ReceiptImage[][] = [];
  const savedImages: { path: string; thumbPath: string | null }[] = [];
  for (const b of blobs) {
    if (typeof b?.url !== "string") {
      return failWith("업로드된 사진 정보가 올바르지 않습니다.", 400);
    }
    let originalBuffer: Buffer;
    try {
      originalBuffer = await fetchPrivateBlob(b.url, BLOB_FETCH_TIMEOUT_MS);
    } catch (err) {
      console.error("Failed to fetch uploaded blob:", err);
      const timedOut = err instanceof PrivateBlobFetchError && err.timedOut;
      return failWith(
        timedOut
          ? "업로드된 사진을 불러오는 데 시간이 너무 오래 걸렸습니다. 잠시 후 다시 시도해 주세요."
          : "업로드된 사진을 불러오지 못했습니다.",
        timedOut ? 504 : 400
      );
    }

    const isPdf = b.contentType === "application/pdf" || /\.pdf$/i.test(b.url);
    let ocrImages: ReceiptImage[];

    if (isPdf) {
      let pages: Buffer[];
      try {
        // PDF가 여러 페이지면(예: 1p 요약 + 2p 결제내역) 전 페이지를 전부 OCR에 넘겨야 뒷장 정보를
        // 놓치지 않는다.
        pages = renderAllPdfPagesToPng(originalBuffer);
        ocrImages = pages.map((buf) => ({ buffer: buf, mimeType: "image/png" }));
      } catch (err) {
        console.error("PDF to image conversion failed:", err);
        return failWith(
          "PDF 파일을 이미지로 변환하지 못했습니다. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다.",
          400
        );
      }
      // 원본으로 올라간 건 PDF 그대로라 화면에 미리보기가 안 된다 - 렌더링한 페이지 PNG를
      // 별도 Blob으로 다시 올려 그걸 표시용 경로로 쓴다.
      //
      // 예전에는 1페이지만 저장해서, 나중에 "다시 인식 시도"를 누르면 2페이지 이후 정보(예: 결제내역)가
      // 사라져 원래 APPROVED였던 판정이 REJECTED로 덮어써졌다. 이제 모든 페이지를 저장하고,
      // 파일명을 "{문서id}-p{페이지}.png"로 지어 재분석 때 같은 문서의 페이지들을 다시 묶을 수 있게 한다.
      const docId = randomUUID();
      try {
        for (const [pageIdx, pageBuffer] of pages.entries()) {
          const pageName = `${docId}-p${pageIdx + 1}`;
          const pngBlob = await put(`uploads/${tripId}/${categoryDir}/${pageName}.png`, pageBuffer, {
            access: "private",
            contentType: "image/png",
          });
          generatedUrls.push(pngBlob.url);
          const thumbPath = await makeThumbnail(pageBuffer, pageName);
          savedImages.push({ path: pngBlob.url, thumbPath });
        }
      } catch (err) {
        console.error("Failed to store rendered PDF pages:", err);
        return failWith("변환한 PDF 페이지를 저장하지 못했습니다.", 500);
      }
      supersededUrls.push(b.url);
    } else if (isHeic(b.contentType, b.url)) {
      // HEIC/HEIF(아이폰 기본 포맷)는 OCR 모델도, 브라우저 <img>도, 정산서 PDF도 읽지 못한다.
      // PDF와 같은 방식으로 서버에서 JPEG로 바꾼 뒤, 그 JPEG를 OCR/표시/PDF에 모두 쓴다.
      let jpegBuffer: Buffer;
      try {
        jpegBuffer = await heicToJpeg(originalBuffer);
      } catch (err) {
        console.error("HEIC to JPEG conversion failed:", err);
        return failWith(
          "아이폰 사진(HEIC)을 변환하지 못했습니다. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다.",
          400
        );
      }
      const imgName = randomUUID();
      try {
        const jpegBlob = await put(`uploads/${tripId}/${categoryDir}/${imgName}.jpg`, jpegBuffer, {
          access: "private",
          contentType: "image/jpeg",
        });
        generatedUrls.push(jpegBlob.url);
        const thumbPath = await makeThumbnail(jpegBuffer, imgName);
        savedImages.push({ path: jpegBlob.url, thumbPath });
      } catch (err) {
        console.error("Failed to store converted HEIC image:", err);
        return failWith("변환한 사진을 저장하지 못했습니다.", 500);
      }
      supersededUrls.push(b.url);
      ocrImages = [{ buffer: jpegBuffer, mimeType: "image/jpeg" }];
    } else {
      ocrImages = [{ buffer: originalBuffer, mimeType: b.contentType }];
      const thumbPath = await makeThumbnail(originalBuffer, randomUUID());
      savedImages.push({ path: b.url, thumbPath });
    }
    photoGroups.push(ocrImages);
  }

  const allLocations = trip.stops.map((s) => s.location);
  const nonDepartureLocations = trip.stops.filter((s) => s.type !== "DEPARTURE").map((s) => s.location);
  const tripStartDate = trip.startDate.toISOString();
  const tripEndDate = trip.endDate.toISOString();

  // 숙박 상한은 영수증 1건이 아니라 출장 단위로 누적 적용한다 - 같은 출장의 다른 숙박
  // 영수증들이 이미 인정받은 금액을 먼저 구해, 남은 한도까지만 이번 영수증을 인정하게 한다.
  // 자동정산 미사용 출장도 수동입력 금액에 이 누적 상한을 그대로 적용한다(2026-08-07).
  const lodgingAlreadyAcceptedInTrip =
    category === "LODGING" ? await sumAcceptedLodgingInTrip(tripId) : 0;

  let analysis: Awaited<ReturnType<typeof analyzeReceipt>>;
  try {
    analysis = await analyzeReceipt({
      photos: photoGroups,
      category: category as (typeof CATEGORIES)[number],
      transportMode,
      tripStartDate,
      tripEndDate,
      tripLocationsAll: allLocations,
      tripLocationsNonDeparture: nonDepartureLocations,
      nights: tripNights(trip),
      lodgingAlreadyAcceptedInTrip,
      autoSettlement: trip.autoSettlement,
      manualAmount,
      manualDatetime,
      manualSeatClass: seatClass,
    });
  } catch (err) {
    console.error("Receipt analysis failed:", err);
    return failWith("영수증 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  const receipt = await prisma.receipt.create({
    data: {
      tripId,
      category: category as (typeof CATEGORIES)[number],
      transportMode,
      seatClass,
      images: {
        create: savedImages.map((img, i) => ({ path: img.path, thumbPath: img.thumbPath, order: i })),
      },
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

  // 변환이 끝나 DB에 안전하게 저장된 뒤에만 원본(PDF/HEIC)을 지운다.
  await cleanupBlobs(supersededUrls);

  // 원본 Blob URL(path/thumbPath)은 클라이언트로 보내지 않는다 - 화면은 항상
  // /api/receipts/image/{id} 프록시로만 사진을 받는다.
  return NextResponse.json({ receipt: toReceiptItem(receipt) });
}

/** 영수증 삭제 - DB 레코드와 함께 Vercel Blob에 올라간 사진 파일도 실제로 지운다. */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
  }

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: { images: true, trip: { select: { ownerEmail: true } } },
  });
  if (!receipt) {
    return NextResponse.json({ error: "영수증을 찾을 수 없습니다." }, { status: 404 });
  }
  // id만 알면 남의 영수증을 지울 수 있던 구멍을 막는다.
  const ownerError = await assertTripOwner(receipt.trip.ownerEmail);
  if (ownerError) {
    return NextResponse.json({ error: ownerError.error }, { status: ownerError.status });
  }

  await prisma.receipt.delete({ where: { id } });
  await cleanupBlobs(
    receipt.images.flatMap((img) => [img.path, img.thumbPath].filter((u): u is string => !!u))
  );
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tripId = searchParams.get("tripId");
  const category = searchParams.get("category");
  if (!tripId) {
    return NextResponse.json({ error: "tripId가 필요합니다." }, { status: 400 });
  }

  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { ownerEmail: true } });
  if (!trip) {
    return NextResponse.json({ error: "출장 정보를 찾을 수 없습니다." }, { status: 404 });
  }
  const ownerError = await assertTripOwner(trip.ownerEmail);
  if (ownerError) {
    return NextResponse.json({ error: ownerError.error }, { status: ownerError.status });
  }

  const receipts = await prisma.receipt.findMany({
    where: {
      tripId,
      ...(category ? { category: category as any } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { images: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ receipts: receipts.map(toReceiptItem) });
}
