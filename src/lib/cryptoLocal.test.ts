import { describe, it, expect, beforeEach } from "vitest";
import { openDB, type IDBPDatabase } from "idb";
import {
  getOrCreateDeviceKey,
  encryptBytes,
  decryptBytes,
  encryptJson,
  decryptJson,
  KEY_STORE,
} from "./cryptoLocal";
import type { KiostLocalDB } from "./localDb";

async function openTestDb(name: string): Promise<IDBPDatabase<KiostLocalDB>> {
  return openDB<KiostLocalDB>(name, 1, {
    upgrade(db) {
      db.createObjectStore(KEY_STORE, { keyPath: "id" });
    },
  });
}

describe("cryptoLocal", () => {
  it("최초 호출 시 키를 생성하고, 이후 호출은 저장된 키를 재사용한다", async () => {
    // IndexedDB에 저장된 CryptoKey를 다시 읽으면 구조적 복제로 매번 새 JS 객체가 나온다
    // (실제 브라우저에서도 마찬가지) - 그래서 참조 동일성(toBe)이 아니라 "같은 키로
    // 암호화한 걸 서로 복호화할 수 있는가"로 동일 키임을 확인한다.
    const db = await openTestDb("crypto-test-1");
    const key1 = await getOrCreateDeviceKey(db);
    const key2 = await getOrCreateDeviceKey(db);
    const enc = await encryptBytes(key1, new TextEncoder().encode("same-key-check"));
    const decrypted = await decryptBytes(key2, enc);
    expect(new TextDecoder().decode(decrypted)).toBe("same-key-check");
  });

  it("DB 연결을 새로 열어도(재시작 시뮬레이션) 같은 키를 그대로 읽어온다", async () => {
    const dbA = await openTestDb("crypto-test-2");
    const keyA = await getOrCreateDeviceKey(dbA);
    dbA.close();

    const dbB = await openTestDb("crypto-test-2");
    const keyB = await getOrCreateDeviceKey(dbB);

    const plain = new TextEncoder().encode("hello");
    const encA = await encryptBytes(keyA, plain);
    const decrypted = await decryptBytes(keyB, encA);
    expect(new TextDecoder().decode(decrypted)).toBe("hello");
  });

  it("생성된 키는 non-extractable이다", async () => {
    const db = await openTestDb("crypto-test-3");
    const key = await getOrCreateDeviceKey(db);
    expect(key.extractable).toBe(false);
  });

  it("바이트 암복호화 왕복이 원문을 그대로 복원한다", async () => {
    const db = await openTestDb("crypto-test-4");
    const key = await getOrCreateDeviceKey(db);
    const original = crypto.getRandomValues(new Uint8Array(256));
    const enc = await encryptBytes(key, original);
    const decrypted = await decryptBytes(key, enc);
    expect(new Uint8Array(decrypted)).toEqual(original);
  });

  it("JSON 암복호화 왕복이 원본 객체를 그대로 복원한다", async () => {
    const db = await openTestDb("crypto-test-5");
    const key = await getOrCreateDeviceKey(db);
    const original = { amount: 12000, memo: "대전-부산 왕복", nested: { ok: true } };
    const enc = await encryptJson(key, original);
    const decrypted = await decryptJson<typeof original>(key, enc);
    expect(decrypted).toEqual(original);
  });

  it("같은 평문을 두 번 암호화해도 IV가 달라 암호문이 달라진다", async () => {
    const db = await openTestDb("crypto-test-6");
    const key = await getOrCreateDeviceKey(db);
    const plain = new TextEncoder().encode("동일한 내용");
    const enc1 = await encryptBytes(key, plain);
    const enc2 = await encryptBytes(key, plain);
    expect(enc1.iv).not.toEqual(enc2.iv);
    expect(new Uint8Array(enc1.cipher)).not.toEqual(new Uint8Array(enc2.cipher));
  });
});

describe("cryptoLocal - 격리성", () => {
  let dbX: IDBPDatabase<KiostLocalDB>;
  let dbY: IDBPDatabase<KiostLocalDB>;

  beforeEach(async () => {
    dbX = await openTestDb("crypto-test-isolation-x");
    dbY = await openTestDb("crypto-test-isolation-y");
  });

  it("서로 다른 DB(=다른 기기 시뮬레이션)의 키로는 복호화할 수 없다", async () => {
    const keyX = await getOrCreateDeviceKey(dbX);
    const keyY = await getOrCreateDeviceKey(dbY);
    const enc = await encryptBytes(keyX, new TextEncoder().encode("secret"));
    await expect(decryptBytes(keyY, enc)).rejects.toThrow();
  });
});
