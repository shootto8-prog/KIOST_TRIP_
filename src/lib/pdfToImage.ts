import * as mupdf from "mupdf";

const MAX_PDF_PAGES = 5;

function renderPageToPng(doc: mupdf.Document, pageIndex: number): Buffer {
  const page = doc.loadPage(pageIndex);
  const pixmap = page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false);
  return Buffer.from(pixmap.asPNG());
}

/**
 * PDF(이메일로 받는 항공권/호텔 예약확인서 등)의 첫 페이지를 PNG 이미지 바이트로 렌더링한다.
 * 순수 WASM 기반(mupdf)이라 poppler 등 OS 네이티브 도구 설치 없이 동작한다.
 * 이후 파이프라인은 사진으로 찍은 영수증과 동일하게 PNG로 취급한다.
 */
export function renderFirstPdfPageToPng(pdfBytes: Buffer): Buffer {
  const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");
  if (doc.countPages() < 1) {
    throw new Error("PDF에 페이지가 없습니다.");
  }
  return renderPageToPng(doc, 0);
}

/**
 * PDF의 모든 페이지(최대 MAX_PDF_PAGES장)를 PNG 이미지 바이트 배열로 렌더링한다.
 * 여러 장으로 나뉜 영수증/예약확인서(예: 1p 요약 + 2p 결제내역)를 OCR 한 번에 전부 인식시키기 위함 -
 * 페이지가 너무 많으면(다일정 전체 일정표 등) 비용/지연이 커지므로 상한을 둔다.
 */
export function renderAllPdfPagesToPng(pdfBytes: Buffer): Buffer[] {
  const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");
  const pageCount = doc.countPages();
  if (pageCount < 1) {
    throw new Error("PDF에 페이지가 없습니다.");
  }
  const pagesToRender = Math.min(pageCount, MAX_PDF_PAGES);
  const pages: Buffer[] = [];
  for (let i = 0; i < pagesToRender; i++) {
    pages.push(renderPageToPng(doc, i));
  }
  return pages;
}
