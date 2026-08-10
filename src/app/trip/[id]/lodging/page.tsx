"use client";

import { useParams } from "next/navigation";
import CategoryPageHeader from "@/components/CategoryPageHeader";
import ReceiptManager from "@/components/ReceiptManager";
import LocalDataBoundary from "@/components/LocalDataBoundary";
import { IconLodging } from "@/components/icons";
import { useTrip } from "@/lib/useLocalTrip";
import { useReceipts } from "@/lib/useLocalReceipts";

export default function LodgingPage() {
  const { id } = useParams<{ id: string }>();
  const { status: tripStatus, trip } = useTrip(id);
  const { status: receiptsStatus, receipts, refresh } = useReceipts(id, "LODGING");

  return (
    <LocalDataBoundary
      loading={tripStatus === "loading" || receiptsStatus === "loading"}
      notFound={tripStatus === "not-found"}
    >
      {trip && (
        <main className="space-y-6">
          <CategoryPageHeader tripId={id} icon={<IconLodging className="size-12" />} title="숙박" />
          <ReceiptManager
            tripId={id}
            category="LODGING"
            initialReceipts={receipts}
            autoSettlement={trip.autoSettlement}
            tripStartDate={trip.startDate}
            tripEndDate={trip.endDate}
            tripStops={trip.stops}
            onChange={refresh}
          />
        </main>
      )}
    </LocalDataBoundary>
  );
}
