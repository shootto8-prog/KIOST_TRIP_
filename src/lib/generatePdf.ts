import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import { CATEGORY_LABEL, STOP_TYPE_LABEL, VERDICT_LABEL, formatDate, formatDateTime } from "./format";
import { getTripWithSummary } from "./tripSummary";
import { toPdfEmbeddableJpeg } from "./imageConvert";
import { readSettlementNoticeImage } from "./settlementNoticeImage";

/** 사진 한 장이 응답하지 않아도 정산서 생성 전체가 무한 대기하지 않도록 상한을 둔다. */
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

const PAGE_WIDTH = 595.28; // A4 (pt)
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Windows 시스템 폰트(맑은고딕) 대신, 어떤 서버(Vercel 등 Linux)에서도 동일하게 동작하도록
// 오픈소스 한글 폰트(Pretendard, SIL OFL)를 프로젝트 자산으로 번들링해서 쓴다.
const FONT_REGULAR_PATH = path.join(process.cwd(), "public", "fonts", "Pretendard-Regular.ttf");
const FONT_BOLD_PATH = path.join(process.cwd(), "public", "fonts", "Pretendard-Bold.ttf");

const COLOR_TEXT = rgb(0.11, 0.11, 0.12);
const COLOR_MUTED = rgb(0.45, 0.45, 0.47);
const COLOR_ACCENT = rgb(0.06, 0.35, 0.85);
const COLOR_REJECTED = rgb(0.75, 0.15, 0.15);
const COLOR_PARTIAL = rgb(0.7, 0.45, 0.05);

class PdfWriter {
  doc: PDFDocument;
  page!: PDFPage;
  y = 0;
  font: PDFFont;
  bold: PDFFont;

  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  ensureSpace(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }

  text(
    str: string,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; gap?: number } = {}
  ) {
    const { size = 11, bold = false, color = COLOR_TEXT, x = MARGIN, gap = size + 6 } = opts;
    this.ensureSpace(gap);
    this.page.drawText(str, { x, y: this.y, size, font: bold ? this.bold : this.font, color });
    this.y -= gap;
  }

  spacer(h: number) {
    this.y -= h;
  }

  hr() {
    this.ensureSpace(14);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: MARGIN + CONTENT_WIDTH, y: this.y },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.86),
    });
    this.y -= 14;
  }

  async image(imagePath: string) {
    // 영수증 사진은 Vercel Blob의 절대 URL로 저장된다 - 로컬 파일시스템 상대경로였던
    // 예전 방식과 둘 다 대응해둔다.
    let bytes: Buffer;
    try {
      if (/^https?:\/\//.test(imagePath)) {
        const res = await fetch(imagePath, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        bytes = Buffer.from(await res.arrayBuffer());
      } else {
        bytes = await readFile(path.join(process.cwd(), "public", imagePath));
      }
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      this.text(
        timedOut
          ? "(첨부 이미지를 시간 내에 불러오지 못했습니다)"
          : "(첨부 이미지 파일을 찾을 수 없습니다)",
        { size: 10, color: COLOR_MUTED, gap: 16 }
      );
      return;
    }

    // pdf-lib은 화면 배치 크기(아래 maxW/maxH)와 무관하게 원본 바이트를 그대로 삽입한다.
    // 아이폰 사진(장당 4~6MB)을 열 장 넣으면 PDF가 50MB를 넘겨 Gmail 첨부 한도(25MB)에 걸리거나
    // 서버리스 함수가 시간 초과로 죽었다 - 삽입 직전에 축소본(장당 200~300KB)으로 바꾼다.
    // HEIC처럼 예전 pdf-lib 분기가 "미리보기 미지원"으로 건너뛰던 형식도 여기서 함께 처리된다.
    // (OCR/화면 표시에 쓰는 원본 파일은 그대로 둔다 - 인식 정확도 유지 목적)
    let embedded;
    try {
      embedded = await this.doc.embedJpg(await toPdfEmbeddableJpeg(bytes));
    } catch (resizeErr) {
      console.error("PDF image resize failed, falling back to original bytes:", resizeErr);
      const ext = path.extname(imagePath).toLowerCase();
      try {
        if (ext === ".png") {
          embedded = await this.doc.embedPng(bytes);
        } else if (ext === ".jpg" || ext === ".jpeg") {
          embedded = await this.doc.embedJpg(bytes);
        } else {
          this.text(`(미리보기 미지원 이미지 형식: ${ext} - 원본 파일에서 확인해주세요)`, {
            size: 10,
            color: COLOR_MUTED,
            gap: 16,
          });
          return;
        }
      } catch {
        this.text("(이미지 렌더링에 실패했습니다)", { size: 10, color: COLOR_MUTED, gap: 16 });
        return;
      }
    }

    const maxW = 220;
    const maxH = 220;
    const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
    const w = embedded.width * scale;
    const h = embedded.height * scale;
    this.ensureSpace(h + 12);
    this.page.drawImage(embedded, { x: MARGIN, y: this.y - h, width: w, height: h });
    this.y -= h + 12;
  }

  /**
   * 정산서 맨 아래에 넣는 안내/홍보 이미지 - 영수증 사진과 달리 페이지 폭에 맞춰 가운데 정렬한다.
   * 가로는 본문 폭(CONTENT_WIDTH, 약 180mm)까지, 세로는 150pt(약 53mm)까지만 차지하도록 축소한다.
   */
  async noticeImage(bytes: Buffer) {
    let embedded;
    try {
      embedded = await this.doc.embedPng(bytes);
    } catch (err) {
      console.error("Failed to embed settlement notice image:", err);
      return;
    }
    const maxW = CONTENT_WIDTH;
    const maxH = 150;
    const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
    const w = embedded.width * scale;
    const h = embedded.height * scale;
    this.ensureSpace(h + 10);
    this.page.drawImage(embedded, { x: MARGIN + (CONTENT_WIDTH - w) / 2, y: this.y - h, width: w, height: h });
    this.y -= h + 10;
  }
}

async function embedKoreanFonts(doc: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont }> {
  doc.registerFontkit(fontkit);
  let regularBytes: Buffer;
  let boldBytes: Buffer;
  try {
    [regularBytes, boldBytes] = await Promise.all([readFile(FONT_REGULAR_PATH), readFile(FONT_BOLD_PATH)]);
  } catch {
    throw new Error(`한글 폰트 파일을 찾을 수 없습니다 (${FONT_REGULAR_PATH}).`);
  }
  // subset: true로 두면 pdf-lib(fontkit)의 서브셋터가 Pretendard의 글리프 테이블을 제대로
  // 처리하지 못해 한글 대부분이 빈 칸으로 출력되는 문제가 있어(테스트로 확인됨), 폰트 전체를
  // 그대로 embed한다. 파일 용량은 커지지만(수 MB) 이메일 첨부 기준으로는 충분히 작다.
  const regular = await doc.embedFont(regularBytes, { subset: false });
  const bold = await doc.embedFont(boldBytes, { subset: false });
  return { regular, bold };
}

const SETTLED_CATEGORIES = ["BREAKFAST", "TRANSPORT", "LODGING"] as const;
const FOOTER_DISCLAIMER =
  "본 자료는 최종확정이 아니며, 담당자의 검토과정에서 조정, 반려될 수 있습니다.";

export async function generateTripPdf(tripId: string): Promise<Uint8Array> {
  const data = await getTripWithSummary(tripId);
  if (!data) throw new Error("출장 정보를 찾을 수 없습니다.");
  const { trip, byCategory, sumByCategory, totalAmount } = data;

  const doc = await PDFDocument.create();
  doc.setTitle("국내여비 실비정산 내역");
  const { regular, bold } = await embedKoreanFonts(doc);
  const w = new PdfWriter(doc, regular, bold);

  w.text("국내여비 실비정산 내역", { size: 20, bold: true, gap: 30 });
  w.text(`생성일시: ${formatDateTime(new Date())}`, { size: 9, color: COLOR_MUTED, gap: 20 });

  w.text(`출장기간   ${formatDate(trip.startDate)} ~ ${formatDate(trip.endDate)}`, {
    size: 12,
    bold: true,
    gap: 22,
  });
  w.text("출장경로", { size: 13, bold: true, gap: 20 });
  for (const stop of trip.stops) {
    w.text(`${STOP_TYPE_LABEL[stop.type]}   ${stop.location}`, {
      size: 11,
      gap: 18,
    });
  }
  w.spacer(8);
  w.hr();

  w.text("항목별 합계", { size: 13, bold: true, gap: 20 });
  for (const c of SETTLED_CATEGORIES) {
    w.text(
      `${CATEGORY_LABEL[c]}   ${byCategory[c].length}건   ${sumByCategory[c].toLocaleString("ko-KR")}원`,
      { size: 11, gap: 18 }
    );
  }
  w.text(`현장사진   ${byCategory.FIELD.length}건`, { size: 11, gap: 18 });
  w.spacer(4);
  w.text(`전체 합계   ${totalAmount.toLocaleString("ko-KR")}원`, {
    size: 15,
    bold: true,
    color: COLOR_ACCENT,
    gap: 28,
  });
  w.hr();

  for (const c of SETTLED_CATEGORIES) {
    const items = byCategory[c];
    if (items.length === 0) continue;

    w.ensureSpace(40);
    w.text(`${CATEGORY_LABEL[c]} 세부내역 (${items.length}건)`, { size: 13, bold: true, gap: 20 });

    for (const r of items) {
      const statusLabel = VERDICT_LABEL[r.verdictStatus];
      const statusColor =
        r.verdictStatus === "REJECTED" ? COLOR_REJECTED : r.verdictStatus === "PARTIAL" ? COLOR_PARTIAL : COLOR_TEXT;

      w.ensureSpace(60);
      w.text(`[${statusLabel}] ${r.ocrMerchantGuess ?? "상호명 인식 안 됨"}`, {
        size: 11.5,
        bold: true,
        color: statusColor,
        gap: 16,
      });
      w.text(
        `  일시: ${r.ocrDateGuess ? formatDateTime(r.ocrDateGuess) : "인식 안 됨"}   ` +
          `인식금액: ${r.ocrAmountGuess !== null ? r.ocrAmountGuess.toLocaleString("ko-KR") + "원" : "인식 안 됨"}   ` +
          `인정금액: ${r.verdictAmount !== null ? r.verdictAmount.toLocaleString("ko-KR") + "원" : "-"}`,
        { size: 10, color: COLOR_MUTED, gap: 15 }
      );
      if (r.verdictMessage) {
        w.text(`  ${r.verdictMessage}`, { size: 10, color: statusColor, gap: 15 });
      }
      if (r.verdictRegulationRef) {
        w.text(`  근거: ${r.verdictRegulationRef}`, { size: 9, color: COLOR_MUTED, gap: 15 });
      }
      for (const img of r.images) {
        await w.image(img.path);
      }
      w.spacer(6);
    }
    w.hr();
  }

  // 현장사진: 판정 대상이 아닌 순수 증빙이라 상태/금액 없이 사진만 나열한다.
  if (byCategory.FIELD.length > 0) {
    w.ensureSpace(40);
    w.text(`현장사진 (${byCategory.FIELD.length}건)`, { size: 13, bold: true, gap: 20 });
    for (const [i, r] of byCategory.FIELD.entries()) {
      w.ensureSpace(30);
      w.text(`${i + 1}. ${formatDateTime(r.createdAt)}`, { size: 10.5, color: COLOR_MUTED, gap: 15 });
      for (const img of r.images) {
        await w.image(img.path);
      }
      w.spacer(6);
    }
    w.hr();
  }

  w.spacer(10);
  w.text(FOOTER_DISCLAIMER, { size: 9, color: COLOR_MUTED, gap: 14 });

  // public/settlement-notice.png 파일을 교체하는 것만으로 넣고 뺄 수 있는 안내/홍보 이미지.
  const noticeImageBytes = await readSettlementNoticeImage();
  if (noticeImageBytes) {
    w.spacer(6);
    await w.noticeImage(noticeImageBytes);
  }

  return doc.save();
}

src/lib/sendEmail.ts

  Read 1 file

import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

export class SendEmailError extends Error {}

/**
 * SMTP_* 환경변수가 전부 채워져 있는지 확인한다. 비어있으면 이메일 기능은 "미설정"으로 간주해
 * 조용히 비활성화된다 - 회사 SMTP 계정을 받기 전까지는 개인 계정을 쓰지 않기로 했기 때문에,
 * 지금은 이 값이 항상 false다. 값을 채우기만 하면(재배포 없이) 바로 켜진다.
 */
export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM_EMAIL
  );
}

function getTransporter() {
  const port = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465는 SMTPS, 587/25는 STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const NOTICE_IMAGE_CID = "settlement-notice-image";

export async function sendTripSettlementEmail(params: {
  to: string;
  subject: string;
  text: string;
  attachment: { filename: string; content: Buffer; contentType: string };
  /** public/settlement-notice.png가 있으면 본문 맨 아래 이미지로 인라인 삽입한다(선택). */
  noticeImage?: { content: Buffer; contentType: string };
}): Promise<void> {
  if (!isEmailConfigured()) {
    throw new SendEmailError(
      "이메일 발송 기능이 아직 설정되지 않았습니다 (.env의 SMTP_* 값이 비어 있습니다)."
    );
  }

  const fromName = process.env.SMTP_FROM_NAME || "정총무";
  const fromEmail = process.env.SMTP_FROM_EMAIL;

  // 이미지가 있을 때만 HTML 본문을 만든다 - 이미지가 없으면 지금처럼 순수 텍스트 메일 그대로 보낸다.
  // (text 필드는 HTML을 지원 안 하는 메일 클라이언트를 위한 대체 본문으로 항상 함께 보낸다.)
  const html = params.noticeImage
    ? params.text
        .split("\n")
        .map((line) => (line ? `<p style="margin:0 0 4px;">${escapeHtml(line)}</p>` : "<br/>"))
        .join("") +
      `<div style="margin-top:16px;"><img src="cid:${NOTICE_IMAGE_CID}" alt="" style="max-width:100%;height:auto;display:block;" /></div>`
    : undefined;

  const attachments: Mail.Attachment[] = [params.attachment];
  if (params.noticeImage) {
    attachments.push({
      filename: "notice.png",
      content: params.noticeImage.content,
      contentType: params.noticeImage.contentType,
      cid: NOTICE_IMAGE_CID,
    });
  }

  const transporter = getTransporter();
  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
      ...(html ? { html } : {}),
      attachments,
    });
  } catch (err) {
    throw new SendEmailError(`이메일 발송에 실패했습니다: ${(err as Error).message}`);
  }
}

src/app/api/trips/[id]/email/route.ts

  Read 1 file

import { NextRequest, NextResponse } from "next/server";
import { generateTripPdf } from "@/lib/generatePdf";
import { isEmailConfigured, sendTripSettlementEmail, SendEmailError } from "@/lib/sendEmail";
import { getTripWithSummary } from "@/lib/tripSummary";
  const fromEmail = process.env.SMTP_FROM_EMAIL;

  // 이미지가 있을 때만 HTML 본문을 만든다 - 이미지가 없으면 지금처럼 순수 텍스트 메일 그대로 보낸다.
  // (text 필드는 HTML을 지원 안 하는 메일 클라이언트를 위한 대체 본문으로 항상 함께 보낸다.)
  const html = params.noticeImage
    ? params.text
        .split("\n")
        .map((line) => (line ? `<p style="margin:0 0 4px;">${escapeHtml(line)}</p>` : "<br/>"))
        .join("") +
      `<div style="margin-top:16px;"><img src="cid:${NOTICE_IMAGE_CID}" alt="" style="max-width:100%;height:auto;display:block;" /></div>`
    : undefined;

  const attachments: Mail.Attachment[] = [params.attachment];
  if (params.noticeImage) {
    attachments.push({
      filename: "notice.png",
      content: params.noticeImage.content,
      contentType: params.noticeImage.contentType,
      cid: NOTICE_IMAGE_CID,
    });
  }

  const transporter = getTransporter();
  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
      ...(html ? { html } : {}),
      attachments,
    });
  } catch (err) {
    throw new SendEmailError(`이메일 발송에 실패했습니다: ${(err as Error).message}`);
  }
}

src/app/api