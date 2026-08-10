"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listReceiptsByTrip, type LocalReceipt, type Category } from "./localDb";

export type UseReceiptsResult = {
  status: "loading" | "ready";
  receipts: LocalReceipt[];
  refresh: () => void;
};

/** IndexedDB에서 한 출장의 영수증 목록을 읽어온다(카테고리 필터 선택) -
 * 예전 Server Component의 prisma.receipt.findMany 대체. */
export function useReceipts(tripId: string, category?: Category): UseReceiptsResult {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [receipts, setReceipts] = useState<LocalReceipt[]>([]);
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    listReceiptsByTrip(tripId, category).then((result) => {
      if (requestId.current !== id) return;
      setReceipts(result);
      setStatus("ready");
    });
  }, [tripId, category]);

  useEffect(() => {
    setStatus("loading");
    refresh();
  }, [tripId, category, refresh]);

  return { status, receipts, refresh };
}
