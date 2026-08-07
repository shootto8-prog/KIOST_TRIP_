import { NextRequest, NextResponse } from "next/server";
import { generateTripPdf } from "@/lib/generatePdf";
import { isEmailConfigured, sendTripSettlementEmail, SendEmailError } from "@/lib/sendEmail";
import { getTripWithSummary } from "@/lib/tripSummary";
import { formatDate, CATEGORY_LABEL } from "@/lib/format";
import { readSettlementNoticeImage } from "@/lib/settlementNoticeImage";
import { assertTripOwner } from "@/lib/ownerGuard";
import { countAndAmount, buildTransportCell } from "@/lib/generatePdf";
import { toPdfEmbeddableJpeg } from "@/lib/imageConvert";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const ownerError = await assertTripOwner(summary.trip.ownerEmail);
  if (ownerError) {
    return NextResponse.json({ error: ownerError.error }, { status: ownerError.status });
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
  const subject = `[정총무]국내여비 증빙서류 내역서 (${formatDate(trip.startDate)} ~ ${formatDate(trip.endDate)})`;
  // PDF의 "항목별 합계" 표와 같은 표시 규칙(countAndAmount/buildTransportCell)을 그대로 써서,
  // 첨부 PDF와 메일 본문에 서로 다른 값이 찍히는 걸 막는다(2026-08-07 안정성 재검토에서 발견 -
  // 그동안 메일 본문은 건수만 보여주고 금액이 없어 PDF와 어긋났었다).
  const bodyLines = [
    trip.autoSettlement
      ? "출장 실비정산 내역을 첨부드립니다."
      : "자동정산을 사용하지 않은 출장입니다. 제출된 증빙 서류를 첨부드리니 확인 후 정산 금액을 확정해 주세요.",
    "",
    trip.autoSettlement
      ? `${CATEGORY_LABEL.BREAKFAST}   ${byCategory.BREAKFAST.length}건   ${sumByCategory.BREAKFAST.toLocaleString("ko-KR")}원`
      : `${CATEGORY_LABEL.BREAKFAST}   ${countAndAmount(byCategory.BREAKFAST.length, sumByCategory.BREAKFAST)}`,
    `${CATEGORY_LABEL.TRANSPORT}   ${buildTransportCell(byCategory.TRANSPORT, trip.autoSettlement)}`,
    trip.autoSettlement
      ? `${CATEGORY_LABEL.LODGING}   ${byCategory.LODGING.length}건   ${sumByCategory.LODGING.toLocaleString("ko-KR")}원`
      : `${CATEGORY_LABEL.LODGING}   ${countAndAmount(byCategory.LODGING.length, sumByCategory.LODGING)}`,
    `현장사진   ${byCategory.FIELD.length}건`,
    ...(trip.autoSettlement ? [`합계   ${totalAmount.toLocaleString("ko-KR")}원`] : []),
  ];

  // public/settlement-notice.png 파일을 교체하는 것만으로 넣고 뺄 수 있는 안내/홍보 이미지 - PDF 하단과 동일.
  // 원본을 그대로 붙이면 메일 하나에 PDF 첨부 + 이 이미지가 두 번(용량 두 배) 실리므로,
  // PDF에 삽입할 때와 같은 방식으로 축소·재인코딩한다(2026-08-07 안정성 재검토).
  const noticeImageBytesRaw = await readSettlementNoticeImage();
  const noticeImageBytes = noticeImageBytesRaw ? await toPdfEmbeddableJpeg(noticeImageBytesRaw) : null;

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
      noticeImage: noticeImageBytes ? { content: noticeImageBytes, contentType: "image/jpeg" } : undefined,
    });
  } catch (err) {
    const message = err instanceof SendEmailError ? err.message : "이메일 발송에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
