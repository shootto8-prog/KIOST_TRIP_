import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertTripOwner } from "@/lib/ownerGuard";

/** 업로드 경로는 항상 `uploads/{tripId}/{category}/{filename}` 형태로 만든다(ReceiptManager 참고). */
function tripIdFromPathname(pathname: string): string | null {
  const parts = pathname.replace(/^\/+/, "").split("/");
  if (parts[0] !== "uploads" || !parts[1]) return null;
  return parts[1];
}

/**
 * 브라우저가 Vercel Blob에 직접 업로드할 때 쓸 클라이언트 토큰을 발급한다.
 * Vercel 서버리스 함수는 요청 본문이 4.5MB로 제한돼 있어, 휴대폰 카메라 사진(보통 5MB+)을
 * 우리 서버를 거쳐 올리면 실패한다 - 그래서 서버는 토큰만 내주고, 실제 파일 바이트는
 * 브라우저에서 Blob으로 곧장 전송한다(@vercel/blob/client의 upload() 참고).
 *
 * 예전에는 이 토큰을 아무 확인 없이 내줬다 - URL만 알면 누구나 30MB 파일을 이 프로젝트 Blob에
 * 무제한 올릴 수 있어 무료 용량/전송량이 외부에서 소진될 수 있었다. 이제 경로의 tripId가 실제
 * 출장인지, 그리고 요청자가 그 출장의 소유자인지 확인한 뒤에만 발급한다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const tripId = tripIdFromPathname(pathname);
        if (!tripId) {
          throw new Error("업로드 경로가 올바르지 않습니다.");
        }
        const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { ownerEmail: true } });
        if (!trip) {
          throw new Error("출장 정보를 찾을 수 없습니다.");
        }
        const ownerError = await assertTripOwner(trip.ownerEmail);
        if (ownerError) {
          throw new Error(ownerError.error);
        }
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
            "application/pdf",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 30 * 1024 * 1024, // 30MB
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
