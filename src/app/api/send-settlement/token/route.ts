import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

/**
 * 브라우저가 조립한 정산서 PDF를 Vercel Blob에 직접 올릴 때 쓸 클라이언트 토큰을 발급한다.
 * Vercel 서버리스 함수는 요청 본문이 4.5MB로 제한돼 있어, 사진이 여러 장 붙은 PDF(수 MB)를
 * 우리 서버를 거쳐 올리면 실패한다 - 그래서 서버는 토큰만 내주고, 실제 PDF 바이트는 브라우저에서
 * Blob으로 곧장 전송한다.
 *
 * 예전 영수증 업로드 토큰(api/receipts/upload)은 발급 전에 "요청자가 그 출장의 소유자인지"를
 * 확인했지만, 이제 출장 데이터 자체가 서버에 없어(로컬 전용) 같은 방식의 확인이 불가능하다.
 * 대신 업로드 가능한 형식(PDF만)·크기·경로를 좁게 제한하고, 보낸 직후 곧바로 삭제해(send-
 * settlement/route.ts) 이 Blob이 발송 완료 후까지 남아있지 않게 한다.
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
        if (!pathname.startsWith("outbound/")) {
          throw new Error("업로드 경로가 올바르지 않습니다.");
        }
        return {
          allowedContentTypes: ["application/pdf"],
          addRandomSuffix: true,
          maximumSizeInBytes: 15 * 1024 * 1024, // 15MB - 이메일 첨부 한도(25MB) 안쪽으로 넉넉히
          access: "private",
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
