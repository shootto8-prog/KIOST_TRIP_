"use client";

import { useState } from "react";
import ReceiptManager from "./ReceiptManager";
import type { ReceiptItem } from "@/lib/receipt";
import { TRANSPORT_MODE_LABEL } from "@/lib/format";

type TransportMode = "SHIP" | "AIR" | "RAIL" | "PRIVATE_CAR" | "BUS";
const MODES: TransportMode[] = ["SHIP", "AIR", "RAIL", "PRIVATE_CAR", "BUS"];

export default function TransportTabs({
  tripId,
  receiptsByMode,
  autoSettlement,
}: {
  tripId: string;
  receiptsByMode: Record<TransportMode, ReceiptItem[]>;
  autoSettlement: boolean;
}) {
  const [mode, setMode] = useState<TransportMode>("SHIP");

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
        initialReceipts={receiptsByMode[mode]}
        autoSettlement={autoSettlement}
      />
    </div>
  );
}
