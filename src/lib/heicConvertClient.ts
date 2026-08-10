/**
 * src/lib/imageConvert.ts(heic-convert, Node 전용)의 브라우저 포트. heic2any는 WASM(libheif)
 * 기반이라 브라우저에서 돈다. 드물게 한 HEIC 파일에 여러 이미지가 묶여있는 경우(연사 등)
 * Blob 배열을 돌려주는데, 이 앱은 영수증 1장=1이미지만 다루므로 첫 번째만 쓴다.
 *
 * heic2any는 모듈 최상단에서 곧바로 window를 참조해, 이 함수를 쓰는 컴포넌트가 클라이언트
 * 컴포넌트여도 Next.js가 초기 HTML을 만들 때 서버에서 한 번 모듈을 평가하면서 터진다
 * ("ReferenceError: window is not defined"). 실제로 쓰일 때(브라우저에서 사용자가 호출할 때)만
 * 동적 import로 불러와 이 문제를 피한다.
 */
export async function heicToJpeg(input: Blob): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({ blob: input, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(result) ? result[0] : result;
}
