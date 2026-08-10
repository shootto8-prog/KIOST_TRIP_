/**
 * SMTP_* 환경변수가 전부 채워져 있는지 확인한다. 비어있으면 이메일 기능은 "미설정"으로 간주해
 * 조용히 비활성화된다.
 *
 * sendEmail.ts에서 이 함수를 같이 정의했다가, 그 파일이 최상단에서 import하는 nodemailer가
 * "use client" 컴포넌트(예: 출장 상세 페이지)에 딸려 들어가 클라이언트 번들이 nodemailer의
 * Node 전용 코드(child_process 등)를 못 찾아 깨지는 문제가 실사용 중 발견됐다. isEmailConfigured는
 * 실제로는 nodemailer를 전혀 안 쓰는 순수 env 체크라, 별도 파일로 분리해 클라이언트에서
 * 안전하게 import할 수 있게 한다(단, process.env.SMTP_*는 서버에서만 채워지므로 브라우저에서
 * 호출하면 항상 false를 반환한다 - 실제 활성화 여부 확인은 서버 API를 거쳐야 한다).
 */
export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM_EMAIL
  );
}
