/**
 * NAVER_MAPS_CLIENT_ID/SECRET이 둘 다 채워져 있는지 확인한다. 비어있으면 "네이버지도 인증하기"
 * 버튼은 자동으로 숨겨진다. isEmailConfigured()(emailConfig.ts)와 같은 이유로 별도 파일로
 * 뗀다 - 이 함수를 쓰는 클라이언트 컴포넌트가 서버 전용 코드를 함께 딸려오면 안 되므로.
 */
export function isNaverMapConfigured(): boolean {
  return Boolean(process.env.NAVER_MAPS_CLIENT_ID && process.env.NAVER_MAPS_CLIENT_SECRET);
}
