import sharp from "sharp";

/**
 * 정산서 PDF에 넣기 위한 축소본. pdf-lib의 embedPng/embedJpg는 화면 배치 크기와 무관하게
 * 원본 바이트를 그대로 삽입하기 때문에, 아이폰 사진(장당 4~6MB) 열 장이면 PDF가 50MB를 넘어
 * Gmail 첨부 한도(25MB)에 걸리거나 서버리스 함수가 시간 초과로 죽었다.
 * 여기서 긴 변 기준으로 줄이고 JPEG로 재인코딩해 장당 200~300KB 수준으로 맞춘다.
 * (OCR/원본 표시용 파일은 건드리지 않는다 - 인식 정확도를 유지하기 위함)
 */
const PDF_IMAGE_MAX_EDGE = 1000;
const PDF_IMAGE_QUALITY = 72;

export async function toPdfEmbeddableJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: "none" })
    .rotate() // EXIF 회전 정보를 실제 픽셀에 반영 (PDF는 EXIF를 읽지 않는다)
    .resize({
      width: PDF_IMAGE_MAX_EDGE,
      height: PDF_IMAGE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: PDF_IMAGE_QUALITY, mozjpeg: true })
    .toBuffer();
}
