"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listActiveTrips, listCompletedTrips, type LocalTrip } from "./localDb";

export type UseTripListResult = {
  status: "loading" | "ready";
  active: LocalTrip[];
  completed: LocalTrip[];
  refresh: () => void;
};

/** 홈 화면용 - 진행중/종료된 출장 목록을 IndexedDB에서 읽어온다. */
export function useTripList(): UseTripListResult {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [active, setActive] = useState<LocalTrip[]>([]);
  const [completed, setCompleted] = useState<LocalTrip[]>([]);
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    Promise.all([listActiveTrips(), listCompletedTrips(10)]).then(([a, c]) => {
      if (requestId.current !== id) return;
      setActive(a);
      setCompleted(c);
      setStatus("ready");
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, active, completed, refresh };
}
