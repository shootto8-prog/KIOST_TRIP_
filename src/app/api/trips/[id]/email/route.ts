import { NextRequest, NextResponse } from "next/server";
import { generateTripPdf } from "@/lib/generatePdf";
import { isEmailConfigured, sendTripSettlementEmail, SendEmailError } from "@/lib/sendEmail";
import { getTripWithSummary } from "@/lib/tripSummary";
import { formatDate, CATEGORY_LABEL } from "@/lib/format";
import { readSettlementNoticeImage } from "@/lib/settlementNoticeImage";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SETTLED_CATEGORIES = ["BREAKFAST", "TRANSPORT", "LODGING"] as const;

// 정산서 PDF 조립(사진 다운로드 + 리사이즈) 후 SMTP 발송까지 하므로 시간이 걸릴 수 있다.
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "이메일 발송 기능이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const to: string | undefined = body?.to;
  if (!to || !EMAIL_PATTERN.test(to)) {
    return NextResponse.json({ error: "올바른 이메일 주소를 입력해 주세요." }, { status: 400 });
  }

  const summary = await getTripWithSummary(id);
  if (!summary) {
    return NextResponse.json({ error: "출장 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateTripPdf(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF 생성에 실패했습니다.";
    const status = message.includes("찾을 수 없습니다") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  const { trip, byCategory, sumByCategory, totalAmount } = summary;
  const subject = `[정총무]정산내역서 (${formatDate(trip.startDate)} ~ ${formatDate(trip.endDate)})`;
  const bodyLines = [
    "출장 실비정산 내역을 첨부드립니다.",
    "",
    ...SETTLED_CATEGORIES.map(
      (c) => `${CATEGORY_LABEL[c]}   ${byCategory[c].length}건   ${sumByCategory[c].toLocaleString("ko-KR")}원`
    ),
    `현장사진   ${byCategory.FIELD.length}건`,
    `합계   ${totalAmount.toLocaleString("ko-KR")}원`,
  ];

  // public/settlement-notice.png 파일을 교체하는 것만으로 넣고 뺄 수 있는 안내/홍보 이미지 - PDF 하단과 동일.
  const noticeImageBytes = await readSettlementNoticeImage();

  try {
    await sendTripSettlementEmail({
      to,
      subject,
      text: bodyLines.join("\n"),
      attachment: {
        filename: `trip-${id}-settlement.pdf`,
        content: Buffer.from(pdfBytes),
        contentType: "application/pdf",
      },
      noticeImage: noticeImageBytes ? { content: noticeImageBytes, contentType: "image/png" } : undefined,
    });
  } catch (err) {
    const message = err instanceof SendEmailError ? err.message : "이메일 발송에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}