"use client";

import { useParams } from "next/navigation";
import CategoryPageHeader from "@/components/CategoryPageHeader";
import TransportTabs from "@/components/TransportTabs";
import LocalDataBoundary from "@/components/LocalDataBoundary";
import { IconTransport } from "@/components/icons";
import { useTrip } from "@/lib/useLocalTrip";
import { useT } from "@/lib/i18n/LanguageProvider";

export default function TransportPage() {
  const { id } = useParams<{ id: string }>();
  const { status: tripStatus, trip } = useTrip(id);
  const t = useT();

  return (
    <LocalDataBoundary loading={tripStatus === "loading"} notFound={tripStatus === "not-found"}>
      {trip && (
        <main className="space-y-6">
          <CategoryPageHeader tripId={id} icon={<IconTransport className="size-12" />} title={t.categories.transport} />
          <TransportTabs
            tripId={id}
            settlementMode={trip.settlementMode}
            autoSettlement={trip.autoSettlement}
            grade={trip.grade}
            tripStartDate={trip.startDate}
            tripEndDate={trip.endDate}
            tripStops={trip.stops}
          />
        </main>
      )}
    </LocalDataBoundary>
  );
}
