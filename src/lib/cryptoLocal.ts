import type { KiostLocalDB } from "./localDb";
import type { IDBPDatabase } from "idb";

/**
 * 기기당 AES-256-GCM 키 1개로 브라우저 로컬 저장(IndexedDB) 데이터를 암복호화한다.
 * 키는 non-extractable로 생성해 IndexedDB에 CryptoKey 객체 그대로(구조적 복제) 저장한다 -
 * exportKey 자체가 막혀 있어 어떤 코드 경로도 원문 키 바이트를 꺼낼 수 없다.
 *
 * 이건 "저장 매체 탈취"(기기 도난/디스크 복사)만 방어한다 - 페이지가 열려있는 동안 벌어지는
 * XSS는 이 키 핸들을 통해 여전히 encrypt/decrypt를 호출할 수 있으므로 막지 못한다.
 * (KIOST_TRIP_로컬화_작업지시서_2.md 7.3절 잔존 위험 참고)
 */

export const KEY_STORE = "cryptoKeys";
const KEY_ID = "device-key";

/** 기기 최초 사용 시 1회 생성, 이후로는 저장된 키를 그대로 재사용한다. */
export async function getOrCreateDeviceKey(db: IDBPDatabase<KiostLocalDB>): Promise<CryptoKey> {
  const existing = await db.get(KEY_STORE, KEY_ID);
  if (existing) return existing.key;

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await db.put(KEY_STORE, { id: KEY_ID, key });
  return key;
}

export type Encrypted = { cipher: ArrayBuffer; iv: Uint8Array };

/** 매번 새 랜덤 12바이트 IV를 써야 한다 - 같은 키로 IV를 재사용하면 AES-GCM의 기밀성이 깨진다. */
function randomIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12));
}

export async function encryptBytes(key: CryptoKey, plain: ArrayBuffer | Uint8Array): Promise<Encrypted> {
  const iv = randomIv();
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv } as AesGcmParams, key, plain as BufferSource);
  return { cipher, iv };
}

export async function decryptBytes(key: CryptoKey, enc: Encrypted): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: enc.iv } as AesGcmParams, key, enc.cipher as BufferSource);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<Encrypted> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return encryptBytes(key, bytes);
}

export async function decryptJson<T>(key: CryptoKey, enc: Encrypted): Promise<T> {
  const bytes = await decryptBytes(key, enc);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
