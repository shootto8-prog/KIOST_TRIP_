"use client";

import Link from "next/link";
import { formatDate } from "@/lib/format";
import NewTripSection from "@/components/NewTripSection";
import TripDeleteButton from "@/components/TripDeleteButton";
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/LanguageToggle";
import { IconBreakfast, IconTransport, IconLodging, IconFieldPhoto } from "@/components/icons";
import { useTripList } from "@/lib/useLocalTripList";
import { useT } from "@/lib/i18n/LanguageProvider";

export default function HomePage() {
  const { status, active: activeTrips, completed: completedTrips, refresh } = useTripList();
  const t = useT();

  return (
    <main className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            {t.home.titlePrefix}
            <span className="text-brand">1.0</span>
          </h1>
          <p className="mt-1 text-[14px] text-neutral-500">{t.home.subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {status === "loading" ? (
        <p className="py-10 text-center text-[14px] text-neutral-400">{t.common.loading}</p>
      ) : (
        <>
          {activeTrips.length > 0 && (
            <section>
              <h2 className="px-1 text-[13px] font-medium uppercase tracking-wide text-neutral-400">
                {t.home.activeTripsHeading}
              </h2>
              <div className="mt-2 space-y-3">
                {activeTrips.map((trip) => {
                  const departure = trip.stops.find((s) => s.type === "DEPARTURE");
                  const arrival = trip.stops.find((s) => s.type === "ARRIVAL");
                  return (
                    <div
                      key={trip.id}
                      className="shadow-glow rounded-[28px] border border-brand/10 bg-white/90 p-4 dark:border-white/10 dark:bg-white/[0.04]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {t.home.statusActive}
                        </span>
                        <TripDeleteButton tripId={trip.id} label="취소" onDeleted={refresh} />
                      </div>
                      <Link href={`/trip/${trip.id}`} className="block active:scale-[0.99]">
                        <p className="mt-1.5 text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
                          {departure?.location ?? "?"} → {arrival?.location ?? "?"}
                        </p>
                        <p className="mt-0.5 text-[13px] text-neutral-500">
                          {formatDate(trip.startDate)} ~ {formatDate(trip.endDate)}
                        </p>
                      </Link>
                      <div className="mt-3 grid grid-cols-4 gap-2">
                        <Link
                          href={`/trip/${trip.id}/breakfast`}
                          className="flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[12px] font-medium text-neutral-600 active:scale-[0.97] dark:text-neutral-300"
                        >
                          <IconBreakfast className="size-10" />
                          {t.categories.breakfast}
                        </Link>
                        <Link
                          href={`/trip/${trip.id}/transport`}
                          className="flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[12px] font-medium text-neutral-600 active:scale-[0.97] dark:text-neutral-300"
                        >
                          <IconTransport className="size-10" />
                          {t.categories.transport}
                        </Link>
                        <Link
                          href={`/trip/${trip.id}/lodging`}
                          className="flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[12px] font-medium text-neutral-600 active:scale-[0.97] dark:text-neutral-300"
                        >
                          <IconLodging className="size-10" />
                          {t.categories.lodging}
                        </Link>
                        <Link
                          href={`/trip/${trip.id}/field`}
                          className="flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[12px] font-medium text-neutral-600 active:scale-[0.97] dark:text-neutral-300"
                        >
                          <IconFieldPhoto className="size-10" />
                          {t.categories.field}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <NewTripSection />

          {completedTrips.length > 0 && (
            <section>
              <h2 className="px-1 text-[13px] font-medium uppercase tracking-wide text-neutral-400">
                {t.home.completedTripsHeading}
              </h2>
              <div className="mt-2 space-y-2">
                {completedTrips.map((trip) => {
                  const departure = trip.stops.find((s) => s.type === "DEPARTURE");
                  const arrival = trip.stops.find((s) => s.type === "ARRIVAL");
                  return (
                    <div
                      key={trip.id}
                      className="shadow-soft rounded-2xl border border-black/5 bg-white/80 p-4 transition hover:border-brand/15 dark:border-white/10 dark:bg-white/[0.04]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/trip/${trip.id}`} className="block min-w-0 flex-1 active:scale-[0.99]">
                          <p className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
                            {departure?.location ?? "?"} → {arrival?.location ?? "?"}
                          </p>
                          <p className="mt-0.5 text-[13px] text-neutral-500">
                            {formatDate(trip.startDate)} ~ {formatDate(trip.endDate)}
                          </p>
                        </Link>
                        <TripDeleteButton tripId={trip.id} label="삭제" onDeleted={refresh} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
