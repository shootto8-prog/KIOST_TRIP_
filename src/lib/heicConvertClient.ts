/**
 * src/lib/imageConvert.ts(heic-convert, Node 전용)의 브라우저 포트. heic2any는 WASM(libheif)
 * 기반이라 브라우저에서 돈다. 드물게 한 HEIC 파일에 여러 이미지가 묶여있는 경우(연사 등)
 * Blob 배열을 돌려주는데, 이 앱은 영수증 1장=1이미지만 다루므로 첫 번째만 쓴다.
 *
 * heic2any는 모듈 최상단에서 곧바로 window를 참조해, 이 함수를 쓰는 컴포넌트가 클라이언트
 * 컴포넌트여도 Next.js가 초기 HTML을 만들 때 서버에서 한 번 모듈을 평가하면서 터진다
 * ("ReferenceError: window is not defined"). 실제로 쓰일 때(브라우저에서 사용자가 호출할 때)만
 * 동적 import로 불러와 이 문제를 피한다.
 *
 * heic2any가 번들한 libheif-js는 오래돼서, 아이폰의 최신 HDR(게인맵 트랙 포함) 사진처럼 HEIC
 * 컨테이너 안 참조(iref)가 많은 파일을 "보안 상한 초과"로 거부한다(실사용 중 확인 - sharp가
 * 쓰는 최신 libheif로도 같은 파일이 "iref box (48) exceeds the security limits of 16
 * references"로 거부됨, 2026-08-11). 사파리(맥/아이폰)는 OS 자체에 HEIC 코덱이 있어 이런
 * 파일도 문제없이 디코드하므로, 브라우저 기본 디코더(createImageBitmap)를 먼저 시도하고
 * 실패할 때만(대부분 OS에 HEIC 코덱이 없는 Chrome/Windows 환경) heic2any로 폴백한다.
 */
async function tryNativeDecode(input: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(input, { imageOrientation: "from-image" });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  } catch {
    return null;
  }
}

export async function heicToJpeg(input: Blob): Promise<Blob> {
  const native = await tryNativeDecode(input);
  if (native) return native;

  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({ blob: input, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(result) ? result[0] : result;
}
