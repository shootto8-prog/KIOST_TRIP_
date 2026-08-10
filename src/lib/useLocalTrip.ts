"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getTrip, type LocalTrip } from "./localDb";

export type UseTripResult = {
  status: "loading" | "ready" | "not-found";
  trip: LocalTrip | null;
  refresh: () => void;
};

/** IndexedDB에서 출장 하나를 읽어온다 - 예전 Server Component의 prisma.trip.findUnique 대체. */
export function useTrip(tripId: string): UseTripResult {
  const [status, setStatus] = useState<"loading" | "ready" | "not-found">("loading");
  const [trip, setTrip] = useState<LocalTrip | null>(null);
  // 여러 refresh()가 겹치거나 tripId가 바뀌는 사이 낡은 응답이 새 응답을 덮어쓰지 않도록
  // 요청마다 번호를 매겨, 가장 최근 요청의 응답만 반영한다.
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    getTrip(tripId).then((result) => {
      if (requestId.current !== id) return;
      setTrip(result);
      setStatus(result ? "ready" : "not-found");
    });
  }, [tripId]);

  useEffect(() => {
    setStatus("loading");
    setTrip(null);
    refresh();
  }, [tripId, refresh]);

  return { status, trip, refresh };
}
