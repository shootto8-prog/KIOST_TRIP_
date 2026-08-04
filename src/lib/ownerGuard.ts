import { getOwnerEmail } from "./identity";

export type OwnerGuardError = { error: string; status: number };

/**
 * 요청자의 owner_email 쿠키가 그 출장의 소유자와 같은지 확인한다.
 * 로그인 시스템이 아니라 "URL만 알면 남의 자료를 보거나 지울 수 있는" 구멍을 막기 위한 최소 방어다.
 *
 * ownerEmail이 비어 있는 출장(이메일 기반 구분을 도입하기 전에 만들어진 것)은 소유자가 없으므로
 * 막지 않는다 - 막으면 기존 사용자가 자기 예전 출장에 접근하지 못하게 된다.
 *
 * 통과하면 null, 막아야 하면 에러 정보를 돌려준다.
 */
export async function assertTripOwner(tripOwnerEmail: string | null): Promise<OwnerGuardError | null> {
  const owner = tripOwnerEmail?.trim().toLowerCase();
  if (!owner) return null;

  const requester = (await getOwnerEmail())?.trim().toLowerCase();
  if (!requester) {
    return { error: "본인 확인이 필요합니다. 홈 화면에서 이메일을 입력해 주세요.", status: 401 };
  }
  if (requester !== owner) {
    return { error: "이 출장에 접근할 권한이 없습니다.", status: 403 };
  }
  return null;
}
