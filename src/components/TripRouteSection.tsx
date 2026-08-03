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
  ownerEmail,
  startDate,
  endDate,
  stops,
}: {
  tripId: string;
  ownerEmail: string | null;
  startDate: string; // ISO
  endDate: string; // ISO
  stops: StopData[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <TripForm
        tripId={tripId}
        ownerEmail={ownerEmail ?? ""}
        initialStartDate={startDate.slice(0, 10)}
        initialEndDate={endDate.slice(0, 10)}
        initialStops={stops.map((s) => ({
          type: s.type,
          location: s.location,
        }))}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <section className="rounded-3xl border border-black/5 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
          출장경로
        </h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[13px] font-medium text-blue-600 dark:text-blue-400"
        >
          출장 정보 변경
        </button>
      </div>
      <p className="mt-2 text-[13.5px] font-medium text-neutral-500">
        {formatDate(startDate)} ~ {formatDate(endDate)}
      </p>
      <ol className="mt-3 space-y-2.5">
        {stops.map((stop) => (
          <li key={stop.id} className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-[12px] font-medium text-neutral-400">
              {STOP_TYPE_LABEL[stop.type]}
            </span>
            <span className="text-[15px] font-medium text-neutral-900 dark:text-neutral-100">
              {stop.location}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}