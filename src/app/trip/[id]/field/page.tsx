"use client";

import { useParams } from "next/navigation";
import CategoryPageHeader from "@/components/CategoryPageHeader";
import ReceiptManager from "@/components/ReceiptManager";
import LocalDataBoundary from "@/components/LocalDataBoundary";
import { IconFieldPhoto } from "@/components/icons";
import { useTrip } from "@/lib/useLocalTrip";
import { useReceipts } from "@/lib/useLocalReceipts";
import { useT } from "@/lib/i18n/LanguageProvider";

export default function FieldPhotoPage() {
  const { id } = useParams<{ id: string }>();
  const { status: tripStatus, trip } = useTrip(id);
  const { status: receiptsStatus, receipts, refresh } = useReceipts(id, "FIELD");
  const t = useT();

  return (
    <LocalDataBoundary
      loading={tripStatus === "loading" || receiptsStatus === "loading"}
      notFound={tripStatus === "not-found"}
    >
      {trip && (
        <main className="space-y-6">
          <CategoryPageHeader tripId={id} icon={<IconFieldPhoto className="size-12" />} title={t.categories.field} />
          <ReceiptManager
            tripId={id}
            category="FIELD"
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
