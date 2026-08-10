/**
 * src/lib/pdfToImage.ts(mupdf 기반)의 브라우저 포트. mupdf 자체가 이미 순수 WASM이라 이론상
 * 브라우저에서도 동작하는데, 서버판은 Node의 Buffer를 쓰고 있어 그 부분만 Uint8Array로 바꾼다.
 *
 * mupdf를 동적 import()로 불러온다 - 정적 import로 최상단에 두면 PDF 영수증을 한 번도 안 쓰는
 * 사용자도 매 페이지 로드마다 WASM 바이너리를 받게 된다. PDF 첨부 영수증을 실제로 올릴 때만
 * 로드되게 미룬다.
 *
 * ⚠️ Next.js 클라이언트 번들에 이 WASM이 실제로 정상 로드되는지는 실기기 검증이 필요하다
 * (작업지시서에도 명시된 리스크) - 안 되면 next.config.mjs에 WASM 자산 처리 설정을 추가해야
 * 할 수 있다.
 */

const MAX_PDF_PAGES = 5;

async function loadMupdf() {
  const mupdf = await import("mupdf");
  return mupdf;
}

function pngToBlob(bytes: Uint8Array): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "image/png" });
}

/** PDF의 모든 페이지(최대 MAX_PDF_PAGES장)를 PNG Blob 배열로 렌더링한다 - 서버판과 동일 목적:
 * 여러 페이지짜리 항공권/예약확인서를 사진처럼 다루기 위함. */
export async function renderAllPdfPagesToPng(pdfBytes: Uint8Array): Promise<Blob[]> {
  const mupdf = await loadMupdf();
  const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");
  const pageCount = doc.countPages();
  if (pageCount < 1) {
    throw new Error("PDF에 페이지가 없습니다.");
  }
  const pagesToRender = Math.min(pageCount, MAX_PDF_PAGES);
  const pages: Blob[] = [];
  for (let i = 0; i < pagesToRender; i++) {
    const page = doc.loadPage(i);
    const pixmap = page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false);
    pages.push(pngToBlob(pixmap.asPNG()));
  }
  return pages;
}
