import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  getOrCreateDeviceKey,
  encryptJson,
  decryptJson,
  encryptBytes,
  decryptBytes,
  KEY_STORE,
  type Encrypted,
} from "./cryptoLocal";

export type StopType = "DEPARTURE" | "STOPOVER" | "ARRIVAL";
/** 고속철도(KTX) 요금이 직급별로 달라(TRANS/ktx.xls) 출장 등록 시 한 번 받아 고정한다. */
export type PositionGrade = "SENIOR" | "JUNIOR";
export type Category = "BREAKFAST" | "TRANSPORT" | "LODGING" | "FIELD";
export type TransportMode = "SHIP" | "AIR" | "RAIL" | "PRIVATE_CAR" | "BUS";
export type OcrStatus = "PENDING" | "DONE" | "FAILED";
export type VerdictStatus = "PENDING" | "APPROVED" | "PARTIAL" | "REJECTED" | "SUBMITTED";
export type TripStatus = "ACTIVE" | "COMPLETED";

export type LocalStop = { id: string; type: StopType; location: string; order: number };

export type LocalTrip = {
  id: string;
  status: TripStatus;
  autoSettlement: boolean;
  grade: PositionGrade;
  startDate: string; // ISO
  endDate: string; // ISO
  createdAt: string; // ISO
  updatedAt: string; // ISO
  stops: LocalStop[];
  /** 식비공제(선택) - 조식 정산(안) 산식에서 N식 × 15,000원을 추가로 빼는 값. 언제든 바꿀 수
   * 있다(출장 등록 시 고정하는 grade/autoSettlement와 다름, 2026-08-10). */
  mealDeductionCount: number;
};

export type LocalReceipt = {
  id: string;
  tripId: string;
  category: Category;
  transportMode: TransportMode | null;
  createdAt: string; // ISO
  images: { id: string; order: number }[];
  ocrStatus: OcrStatus;
  ocrText: string | null;
  ocrAmountGuess: number | null;
  ocrDateGuess: string | null; // ISO
  ocrMerchantGuess: string | null;
  ocrModel: string | null;
  verdictStatus: VerdictStatus;
  verdictAmount: number | null;
  verdictMessage: string | null;
  verdictFailedCheck: string | null;
  verdictRegulationRef: string | null;
};

export type LocalReceiptImageMeta = { id: string; receiptId: string; order: number };

/** 암호화 대상 필드만 - 정렬/필터에 쓰는 값(id/tripId/category/transportMode/createdAt/status 등)은
 * 평문으로 남긴다. 나머지(장소명, OCR 원문, 판정 메시지, 금액)는 이 안에 묶어 암호화한다. */
type TripPayload = Pick<LocalTrip, "startDate" | "endDate" | "stops" | "mealDeductionCount">;
type ReceiptPayload = Omit<
  LocalReceipt,
  "id" | "tripId" | "category" | "transportMode" | "createdAt" | "images"
>;

type TripRecord = {
  id: string;
  status: TripStatus;
  autoSettlement: boolean;
  grade: PositionGrade;
  createdAt: string;
  updatedAt: string;
  enc: Encrypted;
};

type ReceiptRecord = {
  id: string;
  tripId: string;
  category: Category;
  transportMode: TransportMode | null;
  createdAt: string;
  enc: Encrypted;
};

type ReceiptImageRecord = {
  id: string;
  receiptId: string;
  order: number;
  mimeType: string;
  full: Encrypted;
  thumb: Encrypted | null;
};

type SettingsRecord = { key: string; value: unknown };

export interface KiostLocalDB extends DBSchema {
  trips: {
    key: string;
    value: TripRecord;
    indexes: { "by-status": string };
  };
  receipts: {
    key: string;
    value: ReceiptRecord;
    indexes: { "by-trip": string; "by-trip-category": [string, string] };
  };
  receiptImages: {
    key: string;
    value: ReceiptImageRecord;
    indexes: { "by-receipt": string };
  };
  [KEY_STORE]: {
    key: string;
    value: { id: string; key: CryptoKey };
  };
  settings: {
    key: string;
    value: SettingsRecord;
  };
}

export const DB_NAME = "kiost-trip-local";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<KiostLocalDB>> | null = null;
let keyPromise: Promise<CryptoKey> | null = null;

function openLocalDb(): Promise<IDBPDatabase<KiostLocalDB>> {
  if (!dbPromise) {
    dbPromise = openDB<KiostLocalDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const trips = db.createObjectStore("trips", { keyPath: "id" });
        trips.createIndex("by-status", "status");

        const receipts = db.createObjectStore("receipts", { keyPath: "id" });
        receipts.createIndex("by-trip", "tripId");
        receipts.createIndex("by-trip-category", ["tripId", "category"]);

        const images = db.createObjectStore("receiptImages", { keyPath: "id" });
        images.createIndex("by-receipt", "receiptId");

        db.createObjectStore(KEY_STORE, { keyPath: "id" });
        db.createObjectStore("settings", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

async function getDeviceKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = openLocalDb().then(getOrCreateDeviceKey);
  }
  return keyPromise;
}

function newId(): string {
  return crypto.randomUUID();
}

// ---- Trip CRUD ----

async function toLocalTrip(record: TripRecord, key: CryptoKey): Promise<LocalTrip> {
  const payload = await decryptJson<TripPayload>(key, record.enc);
  return {
    id: record.id,
    status: record.status,
    autoSettlement: record.autoSettlement,
    grade: record.grade,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...payload,
  };
}

export async function createTrip(input: {
  startDate: string;
  endDate: string;
  stops: Omit<LocalStop, "id">[];
  autoSettlement: boolean;
  grade: PositionGrade;
}): Promise<LocalTrip> {
  const db = await openLocalDb();
  const key = await getDeviceKey();
  const now = new Date().toISOString();
  const payload: TripPayload = {
    startDate: input.startDate,
    endDate: input.endDate,
    stops: input.stops.map((s) => ({ ...s, id: newId() })),
    mealDeductionCount: 0,
  };
  const record: TripRecord = {
    id: newId(),
    status: "ACTIVE",
    autoSettlement: input.autoSettlement,
    grade: input.grade,
    createdAt: now,
    updatedAt: now,
    enc: await encryptJson(key, payload),
  };
  await db.put("trips", record);
  return toLocalTrip(record, key);
}

export async function updateTrip(
  id: string,
  patch: Partial<{
    status: TripStatus;
    startDate: string;
    endDate: string;
    stops: Omit<LocalStop, "id">[];
    mealDeductionCount: number;
  }>
): Promise<LocalTrip> {
  const db = await openLocalDb();
  const key = await getDeviceKey();
  const existing = await db.get("trips", id);
  if (!existing) throw new Error("출장 정보를 찾을 수 없습니다.");
  const current = await decryptJson<TripPayload>(key, existing.enc);

  const nextPayload: TripPayload = {
    startDate: patch.startDate ?? current.startDate,
    endDate: patch.endDate ?? current.endDate,
    stops: patch.stops ? patch.stops.map((s) => ({ ...s, id: newId() })) : current.stops,
    mealDeductionCount: patch.mealDeductionCount ?? current.mealDeductionCount,
  };
  const record: TripRecord = {
    ...existing,
    status: patch.status ?? existing.status,
    updatedAt: new Date().toISOString(),
    enc: await encryptJson(key, nextPayload),
  };
  await db.put("trips", record);
  return toLocalTrip(record, key);
}

export async function deleteTrip(id: string): Promise<void> {
  const db = await openLocalDb();
  const receiptIds = await db.getAllKeysFromIndex("receipts", "by-trip", id);
  for (const receiptId of receiptIds) {
    await deleteReceipt(String(receiptId));
  }
  await db.delete("trips", id);
}

export async function getTrip(id: string): Promise<LocalTrip | null> {
  const db = await openLocalDb();
  const key = await getDeviceKey();
  const record = await db.get("trips", id);
  if (!record) return null;
  return toLocalTrip(record, key);
}

export async function listActiveTrips(): Promise<LocalTrip[]> {
  const db = await openLocalDb();
  const key = await getDeviceKey();
  const records = await db.getAllFromIndex("trips", "by-status", "ACTIVE");
  const trips = await Promise.all(records.map((r) => toLocalTrip(r, key)));
  return trips.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listCompletedTrips(limit = 10): Promise<LocalTrip[]> {
  const db = await openLocalDb();
  const key = await getDeviceKey();
  const records = await db.getAllFromIndex("trips", "by-status", "COMPLETED");
  const trips = await Promise.all(records.map((r) => toLocalTrip(r, key)));
  return trips.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

// ---- Receipt CRUD ----

async function toLocalReceipt(
  db: IDBPDatabase<KiostLocalDB>,
  record: ReceiptRecord,
  key: CryptoKey
): Promise<LocalReceipt> {
  const [payload, imageMeta] = await Promise.all([
    decryptJson<ReceiptPayload>(key, record.enc),
    listReceiptImageMeta(record.id, db),
  ]);
  return {
    id: record.id,
    tripId: record.tripId,
    category: record.category,
    transportMode: record.transportMode,
    createdAt: record.createdAt,
    images: imageMeta.map(({ id, order }) => ({ id, order })),
    ...payload,
  };
}

export async function createReceipt(input: {
  tripId: string;
  category: Category;
  transportMode: TransportMode | null;
  ocrStatus: OcrStatus;
  ocrText?: string | null;
  ocrAmountGuess?: number | null;
  ocrDateGuess?: string | null;
  ocrMerchantGuess?: string | null;
  ocrModel?: string | null;
  verdictStatus: VerdictStatus;
  verdictAmount?: number | null;
  verdictMessage?: string | null;
  verdictFailedCheck?: string | null;
  verdictRegulationRef?: string | null;
}): Promise<LocalReceipt> {
  const db = await openLocalDb();
  const key = await getDeviceKey();
  const payload: ReceiptPayload = {
    ocrStatus: input.ocrStatus,
    ocrText: input.ocrText ?? null,
    ocrAmountGuess: input.ocrAmountGuess ?? null,
    ocrDateGuess: input.ocrDateGuess ?? null,
    ocrMerchantGuess: input.ocrMerchantGuess ?? null,
    ocrModel: input.ocrModel ?? null,
    verdictStatus: input.verdictStatus,
    verdictAmount: input.verdictAmount ?? null,
    verdictMessage: input.verdictMessage ?? null,
    verdictFailedCheck: input.verdictFailedCheck ?? null,
    verdictRegulationRef: input.verdictRegulationRef ?? null,
  };
  const record: ReceiptRecord = {
    id: newId(),
    tripId: input.tripId,
    category: input.category,
    transportMode: input.transportMode,
    createdAt: new Date().toISOString(),
    enc: await encryptJson(key, payload),
  };
  await db.put("receipts", record);
  return toLocalReceipt(db, record, key);
}

export async function updateReceipt(
  id: string,
  patch: Partial<ReceiptPayload>
): Promise<LocalReceipt> {
  const db = await openLocalDb();
  const key = await getDeviceKey();
  const existing = await db.get("receipts", id);
  if (!existing) throw new Error("영수증을 찾을 수 없습니다.");
  const current = await decryptJson<ReceiptPayload>(key, existing.enc);
  const nextPayload: ReceiptPayload = { ...current, ...patch };
  const record: ReceiptRecord = { ...existing, enc: await encryptJson(key, nextPayload) };
  await db.put("receipts", record);
  return toLocalReceipt(db, record, key);
}

export async function deleteReceipt(id: string): Promise<void> {
  const db = await openLocalDb();
  const imageIds = await db.getAllKeysFromIndex("receiptImages", "by-receipt", id);
  const tx = db.transaction(["receiptImages", "receipts"], "readwrite");
  for (const imageId of imageIds) {
    await tx.objectStore("receiptImages").delete(imageId);
  }
  await tx.objectStore("receipts").delete(id);
  await tx.done;
}

export async function getReceipt(id: string): Promise<LocalReceipt | null> {
  const db = await openLocalDb();
  const key = await getDeviceKey();
  const record = await db.get("receipts", id);
  if (!record) return null;
  return toLocalReceipt(db, record, key);
}

export async function listReceiptsByTrip(tripId: string, category?: Category): Promise<LocalReceipt[]> {
  const db = await openLocalDb();
  const key = await getDeviceKey();
  const records = category
    ? await db.getAllFromIndex("receipts", "by-trip-category", [tripId, category])
    : await db.getAllFromIndex("receipts", "by-trip", tripId);
  const receipts = await Promise.all(records.map((r) => toLocalReceipt(db, r, key)));
  return receipts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---- Receipt image CRUD ----

export async function addReceiptImage(input: {
  receiptId: string;
  order: number;
  mimeType: string;
  fullBytes: ArrayBuffer;
  thumbBytes?: ArrayBuffer | null;
}): Promise<LocalReceiptImageMeta> {
  const db = await openLocalDb();
  const key = await getDeviceKey();
  const record: ReceiptImageRecord = {
    id: newId(),
    receiptId: input.receiptId,
    order: input.order,
    mimeType: input.mimeType,
    full: await encryptBytes(key, input.fullBytes),
    thumb: input.thumbBytes ? await encryptBytes(key, input.thumbBytes) : null,
  };
  await db.put("receiptImages", record);
  return { id: record.id, receiptId: record.receiptId, order: record.order };
}

export async function listReceiptImageMeta(
  receiptId: string,
  dbOverride?: IDBPDatabase<KiostLocalDB>
): Promise<LocalReceiptImageMeta[]> {
  const db = dbOverride ?? (await openLocalDb());
  const records = await db.getAllFromIndex("receiptImages", "by-receipt", receiptId);
  return records
    .map((r) => ({ id: r.id, receiptId: r.receiptId, order: r.order }))
    .sort((a, b) => a.order - b.order);
}

export async function getReceiptImageBytes(
  imageId: string,
  variant: "full" | "thumb" = "full"
): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  const db = await openLocalDb();
  const key = await getDeviceKey();
  const record = await db.get("receiptImages", imageId);
  if (!record) return null;
  const enc = variant === "thumb" ? record.thumb ?? record.full : record.full;
  const bytes = await decryptBytes(key, enc);
  return { bytes, mimeType: record.mimeType };
}

export async function deleteReceiptImage(imageId: string): Promise<void> {
  const db = await openLocalDb();
  await db.delete("receiptImages", imageId);
}

// ---- Settings (device-local, non-sensitive) ----

export async function getSetting<T>(key: string): Promise<T | null> {
  const db = await openLocalDb();
  const record = await db.get("settings", key);
  return (record?.value as T) ?? null;
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  const db = await openLocalDb();
  await db.put("settings", { key, value });
}

/** 테스트 전용 - 매 테스트마다 새 DB 연결/키 캐시를 강제한다.
 * 이전 연결을 닫지 않고 dbPromise만 비우면, 그다음 테스트가 indexedDB.deleteDatabase()를
 * 호출할 때 "아직 열려있는 연결이 있다"는 이유로 blocked 상태에 걸려 사실상 멈춘다
 * (실사용 중 발견 - 테스트가 각각 10초씩 타임아웃 나던 원인). 반드시 먼저 close()한다. */
export async function __resetForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    db?.close();
  }
  dbPromise = null;
  keyPromise = null;
}
