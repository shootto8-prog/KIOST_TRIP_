import sharp from "sharp";
import heicConvert from "heic-convert";

/**
 * 아이폰 기본 촬영 포맷(HEIC/HEIF)은 브라우저 <img>에서도, 멀티모달 LLM에서도, 정산서 PDF
 * 임베드에서도 그대로 쓸 수 없다. 예전에는 업로드는 허용해 놓고 뒷단이 전부 처리하지 못해
 * 판정도 안 되고 정산서에 사진도 안 들어갔다 - 이제 서버에서 받는 즉시 JPEG로 바꿔
 * OCR/화면표시/PDF가 모두 같은 파일을 쓰게 한다. (iOS가 알아서 JPEG로 바꿔주든 아니든 결과 동일)
 */
export function isHeic(contentType: string | null | undefined, urlOrPath: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct === "image/heic" || ct === "image/heif" || ct === "image/heic-sequence") return true;
  return /\.hei[cf](\?|$)/i.test(urlOrPath);
}

export async function heicToJpeg(buffer: Buffer): Promise<Buffer<ArrayBuffer>> {
  const output = await heicConvert({ buffer, format: "JPEG", quality: 0.92 });
  return Buffer.from(output) as Buffer<ArrayBuffer>;
}

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

/**
 * 목록/그리드 썸네일용 축소본. 휴대폰 원본 사진(장당 3~6MB)을 손톱만한 정사각형으로 표시하면서도
 * 매번 원본 전체를 내려받고 있었다 - 화면엔 어차피 긴 변 기준 400px 이상 필요 없으니 여기서
 * 미리 줄여 Blob에 별도로 저장해 두고, 목록/그리드는 이 축소본만 받게 한다.
 * (OCR·정산서 PDF용 원본 표시 경로는 건드리지 않는다 - 인식 정확도·화질 유지를 위함)
 */
const THUMB_MAX_EDGE = 400;
const THUMB_QUALITY = 70;

export async function toThumbnailJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({
      width: THUMB_MAX_EDGE,
      height: THUMB_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
    .toBuffer();
}
