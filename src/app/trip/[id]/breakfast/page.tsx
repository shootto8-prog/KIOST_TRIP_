"use client";

import { useParams } from "next/navigation";
import CategoryPageHeader from "@/components/CategoryPageHeader";
import ReceiptManager from "@/components/ReceiptManager";
import MealDeductionStepper from "@/components/MealDeductionStepper";
import LocalDataBoundary from "@/components/LocalDataBoundary";
import { IconBreakfast } from "@/components/icons";
import { useTrip } from "@/lib/useLocalTrip";
import { useReceipts } from "@/lib/useLocalReceipts";
import { useT } from "@/lib/i18n/LanguageProvider";

export default function BreakfastPage() {
  const { id } = useParams<{ id: string }>();
  const { status: tripStatus, trip, refresh: refreshTrip } = useTrip(id);
  const { status: receiptsStatus, receipts, refresh } = useReceipts(id, "BREAKFAST");
  const t = useT();

  return (
    <LocalDataBoundary
      loading={tripStatus === "loading" || receiptsStatus === "loading"}
      notFound={tripStatus === "not-found"}
    >
      {trip && (
        <main className="space-y-6">
          <CategoryPageHeader tripId={id} icon={<IconBreakfast className="size-12" />} title={t.categories.breakfast} />
          {trip.settlementMode === "DETAILED" && (
            <MealDeductionStepper
              tripId={id}
              value={trip.mealDeductionCount}
              tripStartDate={trip.startDate}
              tripEndDate={trip.endDate}
              onChanged={refreshTrip}
            />
          )}
          <ReceiptManager
            tripId={id}
            category="BREAKFAST"
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
