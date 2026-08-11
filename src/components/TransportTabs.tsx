"use client";

import { useMemo, useState } from "react";
import ReceiptManager from "./ReceiptManager";
import { TRANSPORT_MODE_LABEL } from "@/lib/format";
import { useReceipts } from "@/lib/useLocalReceipts";
import type { TransportMode, LocalStop, PositionGrade, SettlementMode } from "@/lib/localDb";

const MODES: TransportMode[] = ["SHIP", "AIR", "RAIL", "PRIVATE_CAR", "BUS"];

export default function TransportTabs({
  tripId,
  settlementMode,
  autoSettlement,
  grade,
  tripStartDate,
  tripEndDate,
  tripStops,
}: {
  tripId: string;
  settlementMode: SettlementMode;
  autoSettlement: boolean;
  grade: PositionGrade | null;
  tripStartDate: string;
  tripEndDate: string;
  tripStops: LocalStop[];
}) {
  const [mode, setMode] = useState<TransportMode>("SHIP");
  // TRANSPORT 전체를 한 번만 읽어와서 탭별로는 클라이언트에서 필터링한다 - 예전엔 서버가
  // 미리 5개 배열로 나눠 내려줬지만, 이제 이 컴포넌트가 직접 데이터를 갖고 있으니 프롭 드릴링을
  // 한 단계 줄일 수 있다.
  const { receipts, refresh } = useReceipts(tripId, "TRANSPORT");
  const receiptsForMode = useMemo(() => receipts.filter((r) => r.transportMode === mode), [receipts, mode]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-neutral-500/10 p-1">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`shrink-0 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition ${
              mode === m ? "bg-white text-neutral-900 shadow-sm dark:bg-white/90" : "text-neutral-500"
            }`}
          >
            {TRANSPORT_MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <ReceiptManager
        key={mode}
        tripId={tripId}
        category="TRANSPORT"
        transportMode={mode}
        initialReceipts={receiptsForMode}
        settlementMode={settlementMode}
        autoSettlement={autoSettlement}
        grade={grade}
        tripStartDate={tripStartDate}
        tripEndDate={tripEndDate}
        tripStops={tripStops}
        onChange={refresh}
      />
    </div>
  );
}
