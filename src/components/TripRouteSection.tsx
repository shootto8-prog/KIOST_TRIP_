"use client";

import { useState } from "react";
import TripForm from "./TripForm";
import { formatDate, STOP_TYPE_LABEL } from "@/lib/format";

type StopData = {
  id: string;
  type: "DEPARTURE" | "STOPOVER" | "ARRIVAL";
  location: string;
};

export default function TripRouteSection({
  tripId,
  startDate,
  endDate,
  stops,
  onUpdated,
}: {
  tripId: string;
  startDate: string; // ISO
  endDate: string; // ISO
  stops: StopData[];
  onUpdated?: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <TripForm
        tripId={tripId}
        initialStartDate={startDate.slice(0, 10)}
        initialEndDate={endDate.slice(0, 10)}
        initialStops={stops.map((s) => ({
          type: s.type,
          location: s.location,
        }))}
        onSaved={() => {
          setEditing(false);
          onUpdated?.();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <section className="shadow-soft rounded-[28px] border border-black/5 bg-white/80 p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
          출장경로
        </h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[13px] font-medium text-brand dark:text-brand-light"
        >
          출장 정보 변경
        </button>
      </div>
      <p className="mt-2 text-[13.5px] font-medium text-neutral-500">
        {formatDate(startDate)} ~ {formatDate(endDate)}
      </p>
      {(() => {
        const departure = stops.find((s) => s.type === "DEPARTURE");
        const arrival = stops.find((s) => s.type === "ARRIVAL");
        const stopoverCount = stops.filter((s) => s.type === "STOPOVER").length;
        return (
          <div className="mt-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-neutral-400">{STOP_TYPE_LABEL.DEPARTURE}</p>
              <p className="truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
                {departure?.location ?? "-"}
              </p>
            </div>
            <span className="shrink-0 text-neutral-300 dark:text-neutral-600">→</span>
            <div className="min-w-0 flex-1 text-right">
              <p className="text-[11px] font-medium text-neutral-400">{STOP_TYPE_LABEL.ARRIVAL}</p>
              <p className="truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
                {arrival?.location ?? "-"}
              </p>
            </div>
            {stopoverCount > 0 && (
              <span className="shrink-0 rounded-full bg-neutral-500/10 px-2 py-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                +경유
              </span>
            )}
          </div>
        );
      })()}
    </section>
  );
}
