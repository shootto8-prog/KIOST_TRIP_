import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { fetchPrivateBlob, PrivateBlobFetchError } from "@/lib/blobFetch";
import { isEmailConfigured, sendTripSettlementEmail, SendEmailError } from "@/lib/sendEmail";
import { readSettlementNoticeImage } from "@/lib/settlementNoticeImage";
import { toPdfEmbeddableJpeg } from "@/lib/imageConvert";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PDF_FETCH_TIMEOUT_MS = 30_000;

// 출장 데이터가 서버에 없어져(로컬 전용) 예전처럼 "요청자가 이 출장의 소유자인지" 확인할 방법이
// 없다 - URL만 알면 누구나 이 라우트로 임의의 PDF를 임의의 수신자에게 보낼 수 있는 오픈릴레이가
// 될 수 있다. 최소한의 방어로 수신 이메일을 사내 도메인으로 제한한다(2026-08-10, 사용자 확인
// 후 적용). 필요하면 .env의 ALLOWED_EMAIL_DOMAIN으로 재정의할 수 있다.
const ALLOWED_EMAIL_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "kiost.ac.kr").toLowerCase();

function hasAllowedDomain(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

/**
 * 정산서 PDF는 이제 브라우저에서 조립되고(pdfAssembleClient.ts), send-settlement/token으로
 * 발급받은 임시 Blob에 이미 업로드된 상태로 이 라우트에 도착한다 - 이 라우트는 그 Blob을 다시
 * 읽어(fetchPrivateBlob) 회사 SMTP로 발송하기만 하는 상태 없는 중계다(트립 데이터/제목/본문은
 * 클라이언트가 로컬 데이터로 미리 계산해 함께 보낸다). 발송 성공/실패와 무관하게 항상 Blob을
 * 지워, 발송 완료 이후까지 서버 쪽에 정산서 사본이 남지 않게 한다(2026-08-10 로컬화 전환 결정).
 */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "이메일 발송 기능이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const to: string | undefined = body?.to;
  const blobUrl: string | undefined = body?.blobUrl;
  const subject: string | undefined = body?.subject;
  const text: string | undefined = body?.text;
  const filename: string | undefined = body?.filename;

  if (!to || !EMAIL_PATTERN.test(to)) {
    return NextResponse.json({ error: "올바른 이메일 주소를 입력해 주세요." }, { status: 400 });
  }
  if (!hasAllowedDomain(to)) {
    return NextResponse.json(
      { error: `수신 이메일은 @${ALLOWED_EMAIL_DOMAIN} 주소만 가능합니다.` },
      { status: 400 }
    );
  }
  if (!blobUrl || !subject || !text || !filename) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    let pdfBytes: Buffer;
    try {
      pdfBytes = await fetchPrivateBlob(blobUrl, PDF_FETCH_TIMEOUT_MS);
    } catch (err) {
      const timedOut = err instanceof PrivateBlobFetchError && err.timedOut;
      return NextResponse.json(
        { error: timedOut ? "정산서를 불러오는 데 시간이 너무 걸렸습니다. 다시 시도해 주세요." : "정산서를 불러오지 못했습니다." },
        { status: 502 }
      );
    }

    // public/settlement-notice.png 파일을 교체하는 것만으로 넣고 뺄 수 있는 안내/홍보 이미지 - PDF 하단과 동일.
    const noticeImageBytesRaw = await readSettlementNoticeImage();
    const noticeImageBytes = noticeImageBytesRaw ? await toPdfEmbeddableJpeg(noticeImageBytesRaw) : null;

    try {
      await sendTripSettlementEmail({
        to,
        subject,
        text,
        attachment: { filename, content: pdfBytes, contentType: "application/pdf" },
        noticeImage: noticeImageBytes ? { content: noticeImageBytes, contentType: "image/jpeg" } : undefined,
      });
    } catch (err) {
      const message = err instanceof SendEmailError ? err.message : "이메일 발송에 실패했습니다.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } finally {
    await del(blobUrl).catch((err) => {
      console.error("Failed to delete outbound settlement blob:", err);
    });
  }
}
