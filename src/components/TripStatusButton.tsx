"use client";

import { useState } from "react";
import { updateTrip } from "@/lib/localDb";

export default function TripStatusButton({
  tripId,
  status,
  onChanged,
}: {
  tripId: string;
  status: "ACTIVE" | "COMPLETED";
  onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function changeStatus(next: "ACTIVE" | "COMPLETED") {
    setLoading(true);
    try {
      await updateTrip(tripId, { status: next });
      onChanged?.();
    } finally {
      setLoading(false);
    }
  }

  if (status === "ACTIVE") {
    return (
      <button
        type="button"
        onClick={() => changeStatus("COMPLETED")}
        disabled={loading}
        className="w-full rounded-full bg-neutral-900 py-3 text-[15px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {loading ? "처리 중..." : "출장 종료"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => changeStatus("ACTIVE")}
      disabled={loading}
      className="text-[13px] font-medium text-neutral-500 underline-offset-2 hover:underline disabled:opacity-50"
    >
      {loading ? "처리 중..." : "다시 진행중으로 되돌리기"}
    </button>
  );
}
