import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { assertTripOwner } from "@/lib/ownerGuard";

const FETCH_TIMEOUT_MS = 15_000;

// 사진 여러 장이 순차로 요청될 수 있으니(그리드/갤러리) 넉넉히 잡아둔다.
export const maxDuration = 30;

/**
 * 영수증 사진은 2026-08-07부터 Vercel Blob에 access: "private"로 저장된다 - URL을 안다고
 * 아무나 열람할 수 없고, 반드시 이 라우트를 거쳐 본인 확인(owner_email 쿠키)을 통과해야
 * 실제 바이트를 받을 수 있다. 화면의 모든 <img>는 Blob URL을 직접 쓰지 않고 이 라우트를 통한다.
 *
 * 기본은 그리드/갤러리용 축소본(thumbPath)을 준다 - 없는 과거 레코드는 원본(path)으로 폴백한다.
 * ?variant=full을 주면 항상 원본을 준다.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const variant = req.nextUrl.searchParams.get("variant");

  const image = await prisma.receiptImage.findUnique({
    where: { id },
    include: { receipt: { select: { trip: { select: { ownerEmail: true } } } } },
  });
  if (!image) {
    return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
  }
  const ownerError = await assertTripOwner(image.receipt.trip.ownerEmail);
  if (ownerError) {
    return NextResponse.json({ error: ownerError.error }, { status: ownerError.status });
  }

  const url = variant === "full" ? image.path : (image.thumbPath ?? image.path);

  try {
    const result = await get(url, { access: "private", abortSignal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!result || !result.stream) {
      return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
    }
    return new NextResponse(result.stream, {
      status: 200,
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        // 본인 확인을 매 요청 다시 거치므로 공유 캐시(CDN 등)엔 안 남기고, 같은 브라우저
        // 세션 안에서만 잠깐 재사용한다.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("Failed to proxy private receipt image:", err);
    return NextResponse.json({ error: "이미지를 불러오지 못했습니다." }, { status: 502 });
  }
}
