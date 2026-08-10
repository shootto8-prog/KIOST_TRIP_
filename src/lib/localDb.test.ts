import { describe, it, expect, beforeEach } from "vitest";
import * as localDb from "./localDb";

/** 각 테스트가 완전히 독립된 DB 상태로 시작하도록, 매번 실제 fake-indexedDB를 지우고
 * localDb.ts의 모듈 레벨 캐시(dbPromise/keyPromise)도 초기화한다. */
beforeEach(async () => {
  await localDb.__resetForTests();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(localDb.DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

describe("localDb - Trip CRUD", () => {
  it("출장을 만들면 입력값 그대로(경유지 id 부여) 돌려받는다", async () => {
    const trip = await localDb.createTrip({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-03T00:00:00.000Z",
      stops: [
        { type: "DEPARTURE", location: "대전", order: 0 },
        { type: "ARRIVAL", location: "부산", order: 1 },
      ],
      autoSettlement: false,
      grade: "JUNIOR",
    });
    expect(trip.status).toBe("ACTIVE");
    expect(trip.autoSettlement).toBe(false);
    expect(trip.grade).toBe("JUNIOR");
    expect(trip.mealDeductionCount).toBe(0);
    expect(trip.stops).toHaveLength(2);
    expect(trip.stops[0].location).toBe("대전");
    expect(trip.stops[0].id).toBeTruthy();
  });

  it("updateTrip으로 mealDeductionCount를 바꿀 수 있다", async () => {
    const created = await localDb.createTrip({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-02T00:00:00.000Z",
      stops: [
        { type: "DEPARTURE", location: "대전", order: 0 },
        { type: "ARRIVAL", location: "부산", order: 1 },
      ],
      autoSettlement: false,
      grade: "JUNIOR",
    });
    const updated = await localDb.updateTrip(created.id, { mealDeductionCount: 2 });
    expect(updated.mealDeductionCount).toBe(2);
    expect(updated.grade).toBe(created.grade);
  });

  it("getTrip으로 저장된 출장을 그대로 복호화해 읽어온다", async () => {
    const created = await localDb.createTrip({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-02T00:00:00.000Z",
      stops: [
        { type: "DEPARTURE", location: "서울", order: 0 },
        { type: "ARRIVAL", location: "목포", order: 1 },
      ],
      autoSettlement: true,
      grade: "JUNIOR",
    });
    const fetched = await localDb.getTrip(created.id);
    expect(fetched).toEqual(created);
  });

  it("존재하지 않는 출장은 null을 반환한다", async () => {
    const fetched = await localDb.getTrip("no-such-id");
    expect(fetched).toBeNull();
  });

  it("updateTrip으로 상태를 바꾸면 다른 필드는 그대로 유지된다", async () => {
    const created = await localDb.createTrip({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-02T00:00:00.000Z",
      stops: [
        { type: "DEPARTURE", location: "대전", order: 0 },
        { type: "ARRIVAL", location: "부산", order: 1 },
      ],
      autoSettlement: false,
      grade: "JUNIOR",
    });
    const updated = await localDb.updateTrip(created.id, { status: "COMPLETED" });
    expect(updated.status).toBe("COMPLETED");
    expect(updated.startDate).toBe(created.startDate);
    expect(updated.stops).toEqual(created.stops);
  });

  it("listActiveTrips/listCompletedTrips가 상태별로 정확히 나뉜다", async () => {
    const a = await localDb.createTrip({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-02T00:00:00.000Z",
      stops: [
        { type: "DEPARTURE", location: "A", order: 0 },
        { type: "ARRIVAL", location: "B", order: 1 },
      ],
      autoSettlement: false,
      grade: "JUNIOR",
    });
    const b = await localDb.createTrip({
      startDate: "2026-08-03T00:00:00.000Z",
      endDate: "2026-08-04T00:00:00.000Z",
      stops: [
        { type: "DEPARTURE", location: "C", order: 0 },
        { type: "ARRIVAL", location: "D", order: 1 },
      ],
      autoSettlement: false,
      grade: "JUNIOR",
    });
    await localDb.updateTrip(b.id, { status: "COMPLETED" });

    const active = await localDb.listActiveTrips();
    const completed = await localDb.listCompletedTrips();
    expect(active.map((t) => t.id)).toEqual([a.id]);
    expect(completed.map((t) => t.id)).toEqual([b.id]);
  });

  it("deleteTrip은 해당 출장의 영수증과 이미지까지 함께 지운다(cascade)", async () => {
    const trip = await localDb.createTrip({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-02T00:00:00.000Z",
      stops: [
        { type: "DEPARTURE", location: "대전", order: 0 },
        { type: "ARRIVAL", location: "부산", order: 1 },
      ],
      autoSettlement: false,
      grade: "JUNIOR",
    });
    const receipt = await localDb.createReceipt({
      tripId: trip.id,
      category: "BREAKFAST",
      transportMode: null,
      ocrStatus: "PENDING",
      verdictStatus: "SUBMITTED",
      verdictAmount: 8000,
    });
    const image = await localDb.addReceiptImage({
      receiptId: receipt.id,
      order: 0,
      mimeType: "image/jpeg",
      fullBytes: new TextEncoder().encode("fake-jpeg-bytes").buffer,
    });

    await localDb.deleteTrip(trip.id);

    expect(await localDb.getTrip(trip.id)).toBeNull();
    expect(await localDb.getReceipt(receipt.id)).toBeNull();
    expect(await localDb.getReceiptImageBytes(image.id)).toBeNull();
  });
});

describe("localDb - Receipt CRUD", () => {
  async function makeTrip() {
    return localDb.createTrip({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-03T00:00:00.000Z",
      stops: [
        { type: "DEPARTURE", location: "대전", order: 0 },
        { type: "ARRIVAL", location: "부산", order: 1 },
      ],
      autoSettlement: false,
      grade: "JUNIOR",
    });
  }

  it("영수증을 만들면 입력한 판정값을 그대로 복호화해 돌려받는다", async () => {
    const trip = await makeTrip();
    const receipt = await localDb.createReceipt({
      tripId: trip.id,
      category: "LODGING",
      transportMode: null,
      ocrStatus: "PENDING",
      verdictStatus: "APPROVED",
      verdictAmount: 100000,
      verdictMessage: null,
    });
    expect(receipt.category).toBe("LODGING");
    expect(receipt.verdictAmount).toBe(100000);
    expect(receipt.verdictStatus).toBe("APPROVED");
  });

  it("listReceiptsByTrip은 카테고리로 필터링할 수 있다", async () => {
    const trip = await makeTrip();
    await localDb.createReceipt({
      tripId: trip.id,
      category: "BREAKFAST",
      transportMode: null,
      ocrStatus: "PENDING",
      verdictStatus: "SUBMITTED",
    });
    await localDb.createReceipt({
      tripId: trip.id,
      category: "TRANSPORT",
      transportMode: "AIR",
      ocrStatus: "PENDING",
      verdictStatus: "SUBMITTED",
    });

    const all = await localDb.listReceiptsByTrip(trip.id);
    const onlyBreakfast = await localDb.listReceiptsByTrip(trip.id, "BREAKFAST");
    expect(all).toHaveLength(2);
    expect(onlyBreakfast).toHaveLength(1);
    expect(onlyBreakfast[0].category).toBe("BREAKFAST");
  });

  it("영수증에 이미지를 추가하면 조회 시 images 배열에 순서대로 채워진다", async () => {
    const trip = await makeTrip();
    const receipt = await localDb.createReceipt({
      tripId: trip.id,
      category: "FIELD",
      transportMode: null,
      ocrStatus: "PENDING",
      verdictStatus: "APPROVED",
    });
    const img1 = await localDb.addReceiptImage({
      receiptId: receipt.id,
      order: 0,
      mimeType: "image/jpeg",
      fullBytes: new TextEncoder().encode("a").buffer,
    });
    const img2 = await localDb.addReceiptImage({
      receiptId: receipt.id,
      order: 1,
      mimeType: "image/jpeg",
      fullBytes: new TextEncoder().encode("b").buffer,
    });

    const fetched = await localDb.getReceipt(receipt.id);
    expect(fetched!.images).toEqual([
      { id: img1.id, order: 0 },
      { id: img2.id, order: 1 },
    ]);

    const listed = await localDb.listReceiptsByTrip(trip.id);
    expect(listed[0].images).toHaveLength(2);
  });

  it("다른 출장의 영수증은 섞이지 않는다", async () => {
    const tripA = await makeTrip();
    const tripB = await makeTrip();
    await localDb.createReceipt({
      tripId: tripA.id,
      category: "FIELD",
      transportMode: null,
      ocrStatus: "PENDING",
      verdictStatus: "APPROVED",
    });
    const receiptsForB = await localDb.listReceiptsByTrip(tripB.id);
    expect(receiptsForB).toHaveLength(0);
  });

  it("updateReceipt은 부분 patch만 반영하고 나머지는 유지한다", async () => {
    const trip = await makeTrip();
    const receipt = await localDb.createReceipt({
      tripId: trip.id,
      category: "BREAKFAST",
      transportMode: null,
      ocrStatus: "PENDING",
      verdictStatus: "PENDING",
      verdictAmount: null,
    });
    const updated = await localDb.updateReceipt(receipt.id, {
      verdictStatus: "APPROVED",
      verdictAmount: 12000,
    });
    expect(updated.verdictStatus).toBe("APPROVED");
    expect(updated.verdictAmount).toBe(12000);
    expect(updated.category).toBe("BREAKFAST");
  });

  it("deleteReceipt은 딸린 이미지도 함께 지운다", async () => {
    const trip = await makeTrip();
    const receipt = await localDb.createReceipt({
      tripId: trip.id,
      category: "FIELD",
      transportMode: null,
      ocrStatus: "PENDING",
      verdictStatus: "APPROVED",
    });
    const image = await localDb.addReceiptImage({
      receiptId: receipt.id,
      order: 0,
      mimeType: "image/jpeg",
      fullBytes: new TextEncoder().encode("bytes").buffer,
    });
    await localDb.deleteReceipt(receipt.id);
    expect(await localDb.getReceiptImageBytes(image.id)).toBeNull();
  });
});

describe("localDb - Receipt image bytes", () => {
  it("원본/썸네일을 각각 암호화해 저장하고, 지정한 variant로 복호화해 돌려준다", async () => {
    const trip = await localDb.createTrip({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-02T00:00:00.000Z",
      stops: [
        { type: "DEPARTURE", location: "대전", order: 0 },
        { type: "ARRIVAL", location: "부산", order: 1 },
      ],
      autoSettlement: false,
      grade: "JUNIOR",
    });
    const receipt = await localDb.createReceipt({
      tripId: trip.id,
      category: "FIELD",
      transportMode: null,
      ocrStatus: "PENDING",
      verdictStatus: "APPROVED",
    });
    const fullBytes = new TextEncoder().encode("FULL-IMAGE-BYTES").buffer;
    const thumbBytes = new TextEncoder().encode("THUMB").buffer;
    const meta = await localDb.addReceiptImage({
      receiptId: receipt.id,
      order: 0,
      mimeType: "image/jpeg",
      fullBytes,
      thumbBytes,
    });

    const full = await localDb.getReceiptImageBytes(meta.id, "full");
    const thumb = await localDb.getReceiptImageBytes(meta.id, "thumb");
    expect(new TextDecoder().decode(full!.bytes)).toBe("FULL-IMAGE-BYTES");
    expect(new TextDecoder().decode(thumb!.bytes)).toBe("THUMB");
    expect(full!.mimeType).toBe("image/jpeg");
  });

  it("썸네일이 없으면 full로 폴백한다", async () => {
    const trip = await localDb.createTrip({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-02T00:00:00.000Z",
      stops: [
        { type: "DEPARTURE", location: "대전", order: 0 },
        { type: "ARRIVAL", location: "부산", order: 1 },
      ],
      autoSettlement: false,
      grade: "JUNIOR",
    });
    const receipt = await localDb.createReceipt({
      tripId: trip.id,
      category: "FIELD",
      transportMode: null,
      ocrStatus: "PENDING",
      verdictStatus: "APPROVED",
    });
    const meta = await localDb.addReceiptImage({
      receiptId: receipt.id,
      order: 0,
      mimeType: "image/png",
      fullBytes: new TextEncoder().encode("ONLY-FULL").buffer,
    });
    const thumb = await localDb.getReceiptImageBytes(meta.id, "thumb");
    expect(new TextDecoder().decode(thumb!.bytes)).toBe("ONLY-FULL");
  });
});

describe("localDb - settings", () => {
  it("설정값을 저장하고 그대로 읽어온다", async () => {
    await localDb.putSetting("rememberedEmail", "user@kiost.ac.kr");
    const value = await localDb.getSetting<string>("rememberedEmail");
    expect(value).toBe("user@kiost.ac.kr");
  });

  it("없는 키는 null을 반환한다", async () => {
    const value = await localDb.getSetting("no-such-key");
    expect(value).toBeNull();
  });
});
