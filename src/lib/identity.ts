import { cookies } from "next/headers";

/**
 * 로그인이 아니라 "본인 출장만 구분해서 보여주기" 위한 단순 식별용 쿠키다(GAS 버전의
 * listMyTrips(ownerName) 필터링과 같은 개념). URL을 직접 아는 사람은 여전히 해당
 * 출장 상세 페이지에 접근할 수 있다 - 홈 화면 목록만 이 값으로 필터링한다.
 */
export const OWNER_EMAIL_COOKIE = "owner_email";

export async function getOwnerEmail(): Promise<string | null> {
  const store = await cookies();
  return store.get(OWNER_EMAIL_COOKIE)?.value ?? null;
}