import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

/**
 * 브라우저가 Vercel Blob에 직접 업로드할 때 쓸 클라이언트 토큰을 발급한다.
 * Vercel 서버리스 함수는 요청 본문이 4.5MB로 제한돼 있어, 휴대폰 카메라 사진(보통 5MB+)을
 * 우리 서버를 거쳐 올리면 실패한다 - 그래서 서버는 토큰만 내주고, 실제 파일 바이트는
 * 브라우저에서 Blob으로 곧장 전송한다(@vercel/blob/client의 upload() 참고).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
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
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}