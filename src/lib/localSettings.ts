import { getSetting, putSetting } from "./localDb";

/**
 * 기기에 "기억된 이메일" 하나만 다루는 얇은 래퍼 - 정산서 발송 화면에서만 쓰인다.
 * 더 이상 접근 통제 목적이 아니라 순수 편의(재입력 안 해도 되게) 값이라 암호화하지 않는다.
 */
const REMEMBERED_EMAIL_KEY = "rememberedEmail";

export async function getRememberedEmail(): Promise<string | null> {
  return getSetting<string>(REMEMBERED_EMAIL_KEY);
}

export async function setRememberedEmail(email: string): Promise<void> {
  await putSetting(REMEMBERED_EMAIL_KEY, email);
}
