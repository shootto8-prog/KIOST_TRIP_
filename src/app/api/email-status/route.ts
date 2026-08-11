import { NextResponse } from "next/server";
import { isEmailConfigured } from "@/lib/emailConfig";

/**
 * isEmailConfigured()는 process.env.SMTP_*를 읽는데, 이 값들은 서버에서만 채워진다 - 브라우저
 * JS 번들에는 NEXT_PUBLIC_ 접두사가 없는 한 절대 포함되지 않는다. trip/[id]/page.tsx가 "use
 * client" 컴포넌트라 isEmailConfigured()를 그 자리에서 직접 호출하면 실제 SMTP 설정 여부와
 * 무관하게 항상 false가 나와 "준비 중" 배너가 영구히 뜨는 버그가 있었다(2026-08-10). 그래서
 * 이 라우트로 서버에서 판정한 결과를 클라이언트가 fetch로 받아오게 한다.
 */
export async function GET() {
  return NextResponse.json({ enabled: isEmailConfigured() });
}
