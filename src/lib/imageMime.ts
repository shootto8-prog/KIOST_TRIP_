/**
 * src/lib/imageConvert.ts에서 분리한 순수 판별 함수 - 그 파일은 최상단에서 sharp/heic-convert를
 * import하는데, 클라이언트 컴포넌트가 그 파일에서 뭘 하나라도 가져오면 번들러가 sharp까지
 * 통째로 브라우저 번들에 포함시키려다 깨진다(sharp는 Node 네이티브 애드온이라 브라우저에서
 * 못 돈다 - 실사용 중 500 에러로 발견). isHeic 자체는 문자열 검사만 하는 순수 함수라 별도
 * 파일로 떼어내 클라이언트에서 안전하게 쓸 수 있게 한다.
 */
export function isHeic(contentType: string | null | undefined, filenameOrUrl: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct === "image/heic" || ct === "image/heif" || ct === "image/heic-sequence") return true;
  return /\.hei[cf](\?|$)/i.test(filenameOrUrl);
}
