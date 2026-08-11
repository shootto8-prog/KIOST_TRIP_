import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  verdictDisplayLabel,
  formatDate,
  formatDateTime,
  stopTypeLabel,
} from "./format";
import {
  amountOrDash,
  tripTotalDays,
  formatBreakfastSettlement,
  formatTransportSettlement,
  computeBreakfastSettlementTotal,
  exceedsLodgingIntranetThreshold,
} from "./settlementFormat";
import { getTrip, listReceiptsByTrip, getReceiptImageBytes } from "./localDb";
import { toPdfEmbeddableJpeg } from "./imageConvertClient";
import { summarizeByCategory } from "./tripSummaryLocal";
import { DEFAULT_LOCALE, type Locale } from "./i18n/locale";
import ko from "./i18n/dictionaries/ko";
import en from "./i18n/dictionaries/en";
import { categoryDetailHeading, fieldPhotoHeading, countOrDash } from "./i18n/messages/pdf";

/**
 * src/lib/generatePdf.ts(서버, Prisma+파일시스템+Vercel Blob 기반)의 브라우저 포트.
 * - 출장/영수증 데이터: Prisma 대신 localDb에서 읽는다.
 * - 사진: Vercel Blob에서 fetch하는 대신 IndexedDB에서 복호화해 바로 쓴다(네트워크 없음).
 * - 한글 폰트/안내 이미지: fs.readFile 대신 fetch("/fonts/...")·fetch("/settlement-notice.png")로
 *   정적 자산을 받아온다(둘 다 public/에 그대로 있으므로 배포 시 추가 작업 불필요).
 */

const PAGE_WIDTH = 595.28; // A4 (pt)
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const COLOR_TEXT = rgb(0.11, 0.11, 0.12);
const COLOR_MUTED = rgb(0.45, 0.45, 0.47);
const COLOR_ACCENT = rgb(0.06, 0.35, 0.85);
const COLOR_REJECTED = rgb(0.75, 0.15, 0.15);
const COLOR_PARTIAL = rgb(0.7, 0.45, 0.05);

/**
 * 공백 단위로 최대한 자연스럽게(연산자·괄호 앞에서) 줄바꿈해 maxWidth 안에 맞춘다. "정산(안)"
 * 산식처럼 긴 문자열을 표 칸 안에 여러 줄로 보여줄 때 쓴다. 한 단어 자체가 maxWidth보다 길면
 * 글자 단위로 강제로 끊는다(그런 경우는 사실상 없지만 무한루프 방지용 방어 코드).
 */
function wrapText(font: PDFFont, text: string, maxWidth: number, size: number): string[] {
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(test, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
    // 단어 하나가 그 자체로 maxWidth를 넘으면(거의 없지만) 글자 단위로 강제로 끊는다.
    while (font.widthOfTextAtSize(current, size) > maxWidth && current.length > 1) {
      let cut = current.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(current.slice(0, cut), size) > maxWidth) cut--;
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

class PdfWriter {
  doc: PDFDocument;
  page!: PDFPage;
  y = 0;
  font: PDFFont;
  bold: PDFFont;
  messages: { imageNotFound: string; imageRenderFailed: string };

  /** messages는 image()의 두 에러 문구 - PdfWriter는 이 프로퍼티 하나만 locale을 알고,
   * 나머지는 여전히 언어 무관한 순수 그리기 유틸로 남긴다(구분/건수 등 표 헤더는
   * settlementTable()/simpleSummaryTable() 호출부가 이미 번역된 문자열을 넘기는 것과 같은 원칙). */
  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont, messages: { imageNotFound: string; imageRenderFailed: string }) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.messages = messages;
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

  /**
   * 구분/건수/합계금액/정산(안)/비고 5열 표를 그린다 (항목별 합계용, 2026-08-10 개편). "정산(안)"
   * 칸은 사내 업무망에 그대로 옮겨 붙이기 쉽도록 산식 형태 문자열을 통째로 보여주는데, 길어서
   * 여러 줄로 잡힐 수 있어 행 높이를 칸마다 다르게 계산한다. "비고"는 맨 오른쪽에 두고, 숙박이
   * 인트라넷 안내 대상이면 "여비정산", 해당 없으면 "-"만 짧게 보여준다(줄바꿈 계산에는 넣지
   * 않는다 - 항상 한 단어라 넘칠 일이 없다).
   *
   * "정산(안)" 칸은 처음엔 읽기전용 PDF 폼 텍스트필드로 만들었는데(클릭 한 번으로 전체 선택해
   * 복사하기 쉬울 거라 예상), 실사용해보니 여러 PDF 리더(특히 모바일)에서 폼 필드는 일반
   * 텍스트만큼 안정적으로 선택·복사가 안 됐다 - 그래서 일반 drawText로 되돌렸다. 평범하게
   * 그려진 텍스트는(한글 폰트를 서브셋 없이 통째로 embed해뒀으므로) 대부분의 PDF 리더에서
   * 기본 지원하는 드래그 선택/복사가 그대로 먹혀 오히려 더 안정적이다(2026-08-10 실사용 피드백).
   */
  /**
   * 컬럼 폭을 헤더/구분/건수/합계금액/비고 칸의 실제 텍스트 폭(font.widthOfTextAtSize)으로
   * 계산한다 - 예전엔 한글 2-4자 기준 고정 픽셀값이라 영어 헤더("Category"/"Total Amount" 등)가
   * 넘쳤다(2026-08-11 영어 버전 작업 중 발견). "정산(안)"/"Settlement" 칸만 남은 폭을 그대로
   * 쓰는 유동 칸으로 남긴다 - 그 칸의 실제 값(사내망 입력용 산식)은 언어와 무관하게 항상
   * 한국어 표기라 폭이 이미 안정적으로 짧다(아래 formatBreakfastSettlement 주석 참고).
   */
  settlementTable(
    rows: { label: string; count: string; total: string; settlement: string; note: string }[],
    headers: [string, string, string, string, string]
  ) {
    const cellPadX = 12;
    const headerH = 22;
    const cellPadY = 6;
    const lineH = 12;
    const headerFontSize = 10.5;
    const cellFontSize = 10.5;
    const totalNoteFontSize = 9.5;
    const settlementFontSize = 9;
    const minRowH = 24;
    const minSettlementW = 100;

    const colWidth = (header: string, values: string[], font: PDFFont, size: number) =>
      Math.max(this.bold.widthOfTextAtSize(header, headerFontSize), ...values.map((v) => font.widthOfTextAtSize(v, size))) +
      cellPadX;

    const labelW = colWidth(headers[0], rows.map((r) => r.label), this.bold, cellFontSize);
    const countW = colWidth(headers[1], rows.map((r) => r.count), this.font, cellFontSize);
    const totalW = colWidth(headers[2], rows.map((r) => r.total), this.font, totalNoteFontSize);
    const noteW = colWidth(headers[4], rows.map((r) => r.note), this.font, totalNoteFontSize);
    const settlementX = MARGIN + labelW + countW + totalW;
    const settlementW = Math.max(minSettlementW, CONTENT_WIDTH - labelW - countW - totalW - noteW);
    const noteX = settlementX + settlementW;
    const tableWidth = labelW + countW + totalW + settlementW + noteW;

    const rowHeights = rows.map((r) => {
      const lines = wrapText(this.font, r.settlement, settlementW - cellPadX, settlementFontSize).length;
      return Math.max(minRowH, lines * lineH + cellPadY * 2);
    });
    const totalH = headerH + rowHeights.reduce((a, b) => a + b, 0);
    this.ensureSpace(totalH + 12);

    const top = this.y;
    const left = MARGIN;
    const borderColor = rgb(0.82, 0.82, 0.85);
    const headerBg = rgb(0.95, 0.96, 0.98);
    const colX = [left, left + labelW, left + labelW + countW, settlementX, noteX];

    this.page.drawRectangle({ x: left, y: top - headerH, width: tableWidth, height: headerH, color: headerBg });
    this.page.drawRectangle({
      x: left,
      y: top - totalH,
      width: tableWidth,
      height: totalH,
      borderColor,
      borderWidth: 1,
    });
    for (const x of colX.slice(1)) {
      this.page.drawLine({ start: { x, y: top }, end: { x, y: top - totalH }, thickness: 1, color: borderColor });
    }

    headers.forEach((h, i) => {
      this.page.drawText(h, { x: colX[i] + 6, y: top - headerH + 7, size: headerFontSize, font: this.bold, color: COLOR_TEXT });
    });

    let cursorY = top - headerH;
    rows.forEach((r) => {
      const lines = wrapText(this.font, r.settlement, settlementW - cellPadX, settlementFontSize);
      const h = Math.max(minRowH, lines.length * lineH + cellPadY * 2);
      this.page.drawLine({
        start: { x: left, y: cursorY },
        end: { x: left + tableWidth, y: cursorY },
        thickness: 0.5,
        color: borderColor,
      });
      const labelTextY = cursorY - cellPadY - lineH + 2;
      this.page.drawText(r.label, { x: colX[0] + 6, y: labelTextY, size: cellFontSize, font: this.bold, color: COLOR_TEXT });
      this.page.drawText(r.count, { x: colX[1] + 6, y: labelTextY, size: cellFontSize, font: this.font, color: COLOR_TEXT });
      this.page.drawText(r.total, { x: colX[2] + 6, y: labelTextY, size: totalNoteFontSize, font: this.font, color: COLOR_TEXT });
      this.page.drawText(r.note, { x: colX[4] + 6, y: labelTextY, size: totalNoteFontSize, font: this.font, color: COLOR_TEXT });
      lines.forEach((line, li) => {
        this.page.drawText(line, {
          x: settlementX + 6,
          y: cursorY - cellPadY - lineH * (li + 1) + 2,
          size: settlementFontSize,
          font: this.font,
          color: COLOR_TEXT,
        });
      });

      cursorY -= h;
    });

    this.y = top - totalH - 12;
  }

  /**
   * 간편모드용 "항목별 합계" - 구분/건수/합계금액 3열만 있는, "정산(안)"이 생기기 전의 예전
   * 표 형태(2026-08-11). 판정/조정 없이 사용자가 입력한 금액을 그대로 보여주는 간편모드 취지에
   * 맞춰, 산식(정산(안))이나 비고 칸 없이 결과 숫자만 나열한다.
   */
  simpleSummaryTable(rows: { label: string; count: string; total: string }[], headers: [string, string, string]) {
    const cellPadX = 16;
    const headerH = 22;
    const rowH = 26;
    const headerFontSize = 10.5;
    const cellFontSize = 11;
    const minTotalW = 80;

    const colWidth = (header: string, values: string[], font: PDFFont) =>
      Math.max(this.bold.widthOfTextAtSize(header, headerFontSize), ...values.map((v) => font.widthOfTextAtSize(v, cellFontSize))) +
      cellPadX;

    const labelW = colWidth(headers[0], rows.map((r) => r.label), this.bold);
    const countW = colWidth(headers[1], rows.map((r) => r.count), this.font);
    const totalW = Math.max(minTotalW, CONTENT_WIDTH - labelW - countW);
    const tableWidth = labelW + countW + totalW;
    const totalH = headerH + rows.length * rowH;
    this.ensureSpace(totalH + 12);

    const top = this.y;
    const left = MARGIN;
    const borderColor = rgb(0.82, 0.82, 0.85);
    const headerBg = rgb(0.95, 0.96, 0.98);
    const colX = [left, left + labelW, left + labelW + countW];

    this.page.drawRectangle({ x: left, y: top - headerH, width: tableWidth, height: headerH, color: headerBg });
    this.page.drawRectangle({
      x: left,
      y: top - totalH,
      width: tableWidth,
      height: totalH,
      borderColor,
      borderWidth: 1,
    });
    for (const x of colX.slice(1)) {
      this.page.drawLine({ start: { x, y: top }, end: { x, y: top - totalH }, thickness: 1, color: borderColor });
    }

    headers.forEach((h, i) => {
      this.page.drawText(h, { x: colX[i] + 8, y: top - headerH + 7, size: headerFontSize, font: this.bold, color: COLOR_TEXT });
    });

    let cursorY = top - headerH;
    rows.forEach((r) => {
      this.page.drawLine({
        start: { x: left, y: cursorY },
        end: { x: left + tableWidth, y: cursorY },
        thickness: 0.5,
        color: borderColor,
      });
      const textY = cursorY - rowH / 2 - 4;
      this.page.drawText(r.label, { x: colX[0] + 8, y: textY, size: cellFontSize, font: this.bold, color: COLOR_TEXT });
      this.page.drawText(r.count, { x: colX[1] + 8, y: textY, size: cellFontSize, font: this.font, color: COLOR_TEXT });
      this.page.drawText(r.total, { x: colX[2] + 8, y: textY, size: cellFontSize, font: this.font, color: COLOR_TEXT });
      cursorY -= rowH;
    });

    this.y = top - totalH - 12;
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

  /** 영수증 이미지 한 장 - IndexedDB에 저장된 "full" 품질 바이트를 정산서 삽입용으로 축소해 그린다. */
  async image(imageId: string) {
    const stored = await getReceiptImageBytes(imageId, "full");
    if (!stored) {
      this.text(this.messages.imageNotFound, { size: 10, color: COLOR_MUTED, gap: 16 });
      return;
    }

    let embedded;
    try {
      const jpeg = await toPdfEmbeddableJpeg(new Blob([stored.bytes], { type: stored.mimeType }));
      embedded = await this.doc.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
    } catch (err) {
      console.error("PDF image resize failed:", err);
      this.text(this.messages.imageRenderFailed, { size: 10, color: COLOR_MUTED, gap: 16 });
      return;
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

  /** 정산서 맨 아래 안내/홍보 이미지 - 페이지 폭에 맞춰 가운데 정렬한다. */
  async noticeImage(blob: Blob) {
    let embedded;
    try {
      const jpeg = await toPdfEmbeddableJpeg(blob);
      embedded = await this.doc.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
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

async function embedKoreanFonts(doc: PDFDocument, locale: Locale): Promise<{ regular: PDFFont; bold: PDFFont }> {
  doc.registerFontkit(fontkit);
  const [regularRes, boldRes] = await Promise.all([
    fetch("/fonts/Pretendard-Regular.ttf"),
    fetch("/fonts/Pretendard-Bold.ttf"),
  ]);
  if (!regularRes.ok || !boldRes.ok) {
    throw new Error((locale === "ko" ? ko : en).pdf.fontLoadError);
  }
  const [regularBytes, boldBytes] = await Promise.all([regularRes.arrayBuffer(), boldRes.arrayBuffer()]);
  // subset: true로 두면 pdf-lib(fontkit)의 서브셋터가 Pretendard의 글리프 테이블을 제대로
  // 처리하지 못해 한글 대부분이 빈 칸으로 출력되는 문제가 있어(테스트로 확인됨), 폰트 전체를
  // 그대로 embed한다. 파일 용량은 커지지만(수 MB) 이메일 첨부 기준으로는 충분히 작다.
  //
  // calt/rclt/liga/clig(문맥 대체 글리프)는 반드시 꺼야 한다 - Pretendard는 "*"/"-"/"+" 같은
  // 문자가 숫자·한글 사이에 오면 문맥에 따라 다른 글리프로 조용히 바꿔치기하는데(예: "*"가
  // 13156번이 아니라 13208번 글리프로 그려짐), pdf-lib이 복사용 유니코드 매핑표는 항상 "원래"
  // 글리프(13156→"*") 기준으로만 만들어서 실제로 그려진 글리프(13208)와 어긋난다. 그 결과 PDF에서
  // 보이는 글자는 정상인데 메모장에 복사하면 엉뚱한 글자로 깨졌다(2026-08-10 실사용 피드백으로
  // 발견, fontkit으로 글리프 ID를 직접 비교해 원인 확인). 이 문맥 대체 기능들을 꺼서 항상 같은
  // "원래" 글리프만 쓰게 하면 그려진 글자와 복사용 매핑표가 다시 일치한다.
  const noContextualSubstitution = { calt: false, rclt: false, liga: false, clig: false };
  const regular = await doc.embedFont(regularBytes, { subset: false, features: noContextualSubstitution });
  const bold = await doc.embedFont(boldBytes, { subset: false, features: noContextualSubstitution });
  return { regular, bold };
}

const SETTLED_CATEGORIES = ["BREAKFAST", "TRANSPORT", "LODGING"] as const;

export async function assembleTripPdf(tripId: string, locale: Locale = DEFAULT_LOCALE): Promise<Blob> {
  const t = locale === "ko" ? ko : en;
  const trip = await getTrip(tripId);
  if (!trip) throw new Error(t.pdf.tripNotFound);
  const receipts = await listReceiptsByTrip(tripId);
  const { byCategory, sumByCategory, totalAmount } = summarizeByCategory(receipts);

  const titleText = t.pdf.title;

  const doc = await PDFDocument.create();
  doc.setTitle(titleText);
  const { regular, bold } = await embedKoreanFonts(doc, locale);
  const w = new PdfWriter(doc, regular, bold, {
    imageNotFound: t.pdf.imageNotFound,
    imageRenderFailed: t.pdf.imageRenderFailed,
  });

  w.text(titleText, { size: 18, bold: true, gap: 28 });
  w.text(`${t.pdf.generatedAtPrefix}${formatDateTime(new Date(), locale)}`, { size: 9, color: COLOR_MUTED, gap: 20 });

  w.text(`${t.pdf.tripPeriodPrefix}${formatDate(trip.startDate, locale)} ~ ${formatDate(trip.endDate, locale)}`, {
    size: 12,
    bold: true,
    gap: 22,
  });
  w.text(t.pdf.tripRouteHeading, { size: 13, bold: true, gap: 20 });
  for (const stop of trip.stops) {
    w.text(`${stopTypeLabel(stop.type, locale)}   ${stop.location}`, {
      size: 11,
      gap: 18,
    });
  }
  w.spacer(8);
  w.hr();

  w.text(t.pdf.itemSummaryHeading, { size: 13, bold: true, gap: 20 });

  const tableHeaders5: [string, string, string, string, string] = [
    t.pdf.headers.category,
    t.pdf.headers.count,
    t.pdf.headers.total,
    t.pdf.headers.settlement,
    t.pdf.headers.note,
  ];
  const tableHeaders3: [string, string, string] = [t.pdf.headers.category, t.pdf.headers.count, t.pdf.headers.total];

  if (trip.settlementMode === "SIMPLE") {
    // 간편모드는 "정산(안)" 산식·인트라넷 비고 칸이 있는 상세모드 표 대신, 예전처럼 구분/건수/
    // 합계금액 3열짜리 단순한 표로 보여준다(2026-08-11). 금액은 상세모드와 마찬가지로 규정
    // 검토를 거친 확인금액(verdictAmount) 합계다 - 조식만 상세모드와 달리 "45,000×일수-15,000+X"
    // 산식으로 재계산하지 않고, 등록된 영수증의 확인금액 합계를 그대로 보여준다.
    w.simpleSummaryTable(
      [
        {
          label: t.categories.breakfast,
          count: countOrDash(locale, byCategory.BREAKFAST.length),
          total: amountOrDash(sumByCategory.BREAKFAST),
        },
        {
          label: t.pdf.categoryLabels.transport,
          count: countOrDash(locale, byCategory.TRANSPORT.length),
          total: amountOrDash(sumByCategory.TRANSPORT),
        },
        {
          label: t.pdf.categoryLabels.lodging,
          count: countOrDash(locale, byCategory.LODGING.length),
          total: amountOrDash(sumByCategory.LODGING),
        },
        { label: t.pdf.categoryLabels.field, count: countOrDash(locale, byCategory.FIELD.length), total: t.pdf.noteDash },
      ],
      tableHeaders3
    );
    w.spacer(4);
  } else {
    // "정산(안)" 칸은 사내 업무망에 그대로 옮겨 적기 쉽도록 산식 형태로 보여준다(2026-08-10).
    // 조식은 "1일 기본 45,000 × 총 일수 - 15,000(1일차 조식비 제외) + 앱에 등록된 조식 인정금액",
    // 교통은 등록된 각 건의 금액을 "A + B + ..."로 나열, 숙박은 인정금액 합계 그대로. 사내 업무망
    // 표기에 맞춰 이 PDF 안에서는 금액에 "원" 단위를 붙이지 않는다(2026-08-10, 사용자 요청).
    // "합계금액" 칸은 그 산식을 미리 계산한 최종 숫자만 따로 보여준다(산식과 별개로 최종금액도
    // 한눈에 보고 싶다는 피드백).
    //
    // formatBreakfastSettlement/formatTransportSettlement는 locale과 무관하게 항상 한국어
    // 산식 표기("*"/"원 없음"/"1일차 조식비 제외" 등)로 고정한다 - 이 칸의 목적 자체가 KIOST
    // 사내 업무망(한국어 시스템)에 그대로 옮겨 붙이는 것이라, 영어로 바꾸면 오히려 원래 용도를
    // 못 쓰게 된다(2026-08-11 영어 버전 작업 시점 결정 - settlementFormat.ts 주석 참고).
    const totalDays = tripTotalDays(trip.startDate, trip.endDate);
    const breakfastTotal = computeBreakfastSettlementTotal(
      totalDays,
      sumByCategory.BREAKFAST,
      trip.mealDeductionCount
    );
    const transportAmounts = byCategory.TRANSPORT.map((r) => r.verdictAmount ?? 0);
    const transportTotal = transportAmounts.reduce((s, a) => s + a, 0);
    // 숙박 "비고"란 - 영수증 개별이 아니라 이 출장의 숙박 합계 전체 ÷ 전체 박수로 딱 한 번만
    // 판단한다(사내 시스템 기준과 동일, 2026-08-10). ReceiptManager.tsx의 화면 안내와 같은 기준
    // 함수(exceedsLodgingIntranetThreshold)를 써서 둘이 어긋나지 않게 한다.
    const tripNights = Math.max(1, totalDays - 1);
    const lodgingNote = exceedsLodgingIntranetThreshold(sumByCategory.LODGING, tripNights)
      ? t.pdf.noteLodgingIntranet
      : t.pdf.noteDash;
    // 조식비를 실제로 신청한 경우(앱에 등록된 조식 인정금액이 있는 경우, 산식의 "+ N" 항이
    // 붙는 것과 같은 조건)에만 "조식"이라고 표시한다(2026-08-10, 사용자 요청).
    const breakfastNote = sumByCategory.BREAKFAST > 0 ? t.pdf.noteBreakfastYes : t.pdf.noteDash;
    w.settlementTable(
      [
        {
          // 이 표에서만 "조식" 대신 "식비"로 표기한다(2026-08-10, 사용자 요청) - 다른 화면(카테고리
          // 카드, 조식 메뉴 헤더 등)의 "조식" 표기는 그대로 둔다.
          label: t.pdf.categoryLabels.breakfast,
          count: countOrDash(locale, byCategory.BREAKFAST.length),
          total: breakfastTotal.toLocaleString("ko-KR"),
          settlement: formatBreakfastSettlement(totalDays, sumByCategory.BREAKFAST, trip.mealDeductionCount),
          note: breakfastNote,
        },
        {
          label: t.pdf.categoryLabels.transport,
          count: countOrDash(locale, byCategory.TRANSPORT.length),
          total: amountOrDash(transportTotal),
          settlement: formatTransportSettlement(transportAmounts),
          note: t.pdf.noteDash,
        },
        {
          label: t.pdf.categoryLabels.lodging,
          count: countOrDash(locale, byCategory.LODGING.length),
          total: amountOrDash(sumByCategory.LODGING),
          settlement: amountOrDash(sumByCategory.LODGING),
          note: lodgingNote,
        },
        {
          label: t.pdf.categoryLabels.field,
          count: countOrDash(locale, byCategory.FIELD.length),
          total: t.pdf.noteDash,
          settlement: t.pdf.noteDash,
          note: t.pdf.noteDash,
        },
      ],
      tableHeaders5
    );
    w.spacer(4);
    if (trip.autoSettlement) {
      w.text(`${t.pdf.grandTotalPrefix}${totalAmount.toLocaleString("ko-KR")}`, {
        size: 15,
        bold: true,
        color: COLOR_ACCENT,
        gap: 28,
      });
    } else {
      w.text(t.pdf.autoSettlementOffNotice, {
        size: 12,
        bold: true,
        color: COLOR_ACCENT,
        gap: 28,
      });
    }
  }
  w.hr();

  const sectionCategoryLabel: Record<(typeof SETTLED_CATEGORIES)[number], string> = {
    BREAKFAST: t.categories.breakfast,
    TRANSPORT: t.categories.transport,
    LODGING: t.categories.lodging,
  };

  for (const c of SETTLED_CATEGORIES) {
    const items = byCategory[c];
    if (items.length === 0) continue;

    w.ensureSpace(40);
    w.text(categoryDetailHeading(locale, sectionCategoryLabel[c], items.length), { size: 13, bold: true, gap: 20 });

    for (const r of items) {
      const statusLabel = verdictDisplayLabel(r.verdictStatus, trip.autoSettlement, r.category, r.transportMode, locale);
      // 자동정산 미사용 출장은 "불인정=빨강"처럼 최종 확정을 암시하는 색을 안 쓴다 - 확인요청은
      // PARTIAL과 같은 주황색으로만 표시한다(REJECTED도 여기 포함).
      const statusColor = !trip.autoSettlement
        ? r.verdictStatus === "PARTIAL" || r.verdictStatus === "REJECTED"
          ? COLOR_PARTIAL
          : COLOR_TEXT
        : r.verdictStatus === "REJECTED"
        ? COLOR_REJECTED
        : r.verdictStatus === "PARTIAL"
        ? COLOR_PARTIAL
        : COLOR_TEXT;
      const amountLabel = trip.autoSettlement ? t.pdf.amountLabelAuto : t.pdf.amountLabelManual;

      w.ensureSpace(60);
      const ocrSkipped = r.ocrStatus === "PENDING";
      w.text(
        ocrSkipped ? `[${statusLabel}]` : `[${statusLabel}] ${r.ocrMerchantGuess ?? t.pdf.merchantNotRecognized}`,
        { size: 11.5, bold: true, color: statusColor, gap: 16 }
      );
      if (ocrSkipped) {
        w.text(
          `  ${t.pdf.submittedAtPrefix}${formatDateTime(r.createdAt, locale)}` +
            (r.verdictAmount !== null ? `   ${amountLabel}: ${r.verdictAmount.toLocaleString("ko-KR")}` : ""),
          { size: 10, color: COLOR_MUTED, gap: 15 }
        );
      } else {
        w.text(
          `  ${t.pdf.datetimePrefix}${r.ocrDateGuess ? formatDateTime(r.ocrDateGuess, locale) : t.pdf.notRecognized}   ` +
            `${t.pdf.recognizedAmountPrefix}${r.ocrAmountGuess !== null ? r.ocrAmountGuess.toLocaleString("ko-KR") : t.pdf.notRecognized}   ` +
            `${amountLabel}: ${r.verdictAmount !== null ? r.verdictAmount.toLocaleString("ko-KR") : t.pdf.noteDash}`,
          { size: 10, color: COLOR_MUTED, gap: 15 }
        );
      }
      if (r.verdictMessage) {
        w.text(`  ${r.verdictMessage}`, { size: 10, color: statusColor, gap: 15 });
      }
      if (r.verdictRegulationRef) {
        w.text(`  ${t.pdf.regulationRefPrefix}${r.verdictRegulationRef}`, { size: 9, color: COLOR_MUTED, gap: 15 });
      }
      for (const img of r.images) {
        await w.image(img.id);
      }
      w.spacer(6);
    }
    w.hr();
  }

  // 현장사진: 판정 대상이 아닌 순수 증빙이라 상태/금액 없이 사진만 나열한다.
  if (byCategory.FIELD.length > 0) {
    w.ensureSpace(40);
    w.text(fieldPhotoHeading(locale, byCategory.FIELD.length), { size: 13, bold: true, gap: 20 });
    for (const [i, r] of byCategory.FIELD.entries()) {
      w.ensureSpace(30);
      // "네이버지도 인증하기"로 만든 항목은 verdictMessage에 "날짜 시간 주소"가 이미 합쳐져
      // 있다(ReceiptManager.tsx verifyLocation) - 그 경우만 보여준다. 일반 현장사진은
      // createdAt이 실제 촬영 시각이 아니라 "이 앱에 등록한 시각"이라(출장 종료 후 나중에
      // 올리는 경우도 있어) 오히려 오해를 줄 수 있어 번호만 남긴다(2026-08-11, 사용자 요청).
      w.text(r.verdictMessage ? `${i + 1}. ${r.verdictMessage}` : `${i + 1}.`, { size: 10.5, color: COLOR_MUTED, gap: 15 });
      for (const img of r.images) {
        await w.image(img.id);
      }
      w.spacer(6);
    }
    w.hr();
  }

  w.spacer(10);
  w.text(t.pdf.footerDisclaimer, { size: 9, color: COLOR_MUTED, gap: 14 });

  // public/settlement-notice.png 파일을 교체하는 것만으로 넣고 뺄 수 있는 안내/홍보 이미지.
  try {
    const noticeRes = await fetch("/settlement-notice.png");
    if (noticeRes.ok) {
      w.spacer(6);
      await w.noticeImage(await noticeRes.blob());
    }
  } catch (err) {
    console.error("Failed to load settlement notice image:", err);
  }

  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
