/**
 * src/lib/imageConvert.ts(sharp 기반, 서버 전용)의 브라우저 포트. Canvas API로 리사이즈+JPEG
 * 재인코딩한다 - sharp의 mozjpeg 수준 압축은 없어 같은 품질 설정에서도 결과 파일이 다소 커질
 * 수 있다(실측 후 필요하면 quality 값 조정). EXIF 회전은 sharp의 .rotate()가 하던 걸
 * createImageBitmap의 imageOrientation:"from-image" 옵션으로 대체한다.
 */

async function resizeAndReencode(
  input: Blob,
  maxEdge: number,
  quality: number
): Promise<Blob> {
  const bitmap = await createImageBitmap(input, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저에서는 이미지를 처리할 수 없습니다.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.convertToBlob({ type: "image/jpeg", quality: quality / 100 });
}

/** generatePdf.ts의 toPdfEmbeddableJpeg와 같은 목표(장당 200~300KB) - 정산서 PDF 삽입용. */
const PDF_IMAGE_MAX_EDGE = 1000;
const PDF_IMAGE_QUALITY = 72;

export async function toPdfEmbeddableJpeg(input: Blob): Promise<Blob> {
  return resizeAndReencode(input, PDF_IMAGE_MAX_EDGE, PDF_IMAGE_QUALITY);
}

/** 목록/그리드 썸네일용 - imageConvert.ts의 toThumbnailJpeg와 동일한 목표치. */
const THUMB_MAX_EDGE = 400;
const THUMB_QUALITY = 70;

export async function toThumbnailJpeg(input: Blob): Promise<Blob> {
  return resizeAndReencode(input, THUMB_MAX_EDGE, THUMB_QUALITY);
}
