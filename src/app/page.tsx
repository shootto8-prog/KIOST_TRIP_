import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import TripForm from "@/components/TripForm";
import TripDeleteButton from "@/components/TripDeleteButton";
import { IconBreakfast, IconTransport, IconLodging, IconPhoto } from "@/components/icons";

export default async function HomePage() {
  const [activeTrips, completedTrips] = await Promise.all([
    prisma.trip.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: { stops: { orderBy: { order: "asc" } } },
    }),
    prisma.trip.findMany({
      where: { status: "COMPLETED" },
      orderBy: { updatedAt: "desc" },
      include: { stops: { orderBy: { order: "asc" } } },
      take: 10,
    }),
  ]);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          정총무1.0
        </h1>
        <p className="mt-1 text-[14px] text-neutral-500">
          KIOST 국내여비 간편서비스 · 출장정보를 등록하고 조식·교통·숙박·현장사진을 관리하세요.
        </p>
      </header>

      {activeTrips.length > 0 && (
        <section>
          <h2 className="px-1 text-[13px] font-medium uppercase tracking-wide text-neutral-400">
            진행중인 출장
          </h2>
          <div className="mt-2 space-y-3">
            {activeTrips.map((trip) => {
              const departure = trip.stops.find((s) => s.type === "DEPARTURE");
              const arrival = trip.stops.find((s) => s.type === "ARRIVAL");
              return (
                <div
                  key={trip.id}
                  className="rounded-3xl border border-black/5 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-block rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      진행중
                    </span>
                    <TripDeleteButton tripId={trip.id} label="취소" />
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
                      className="flex flex-col items-center gap-1 rounded-2xl bg-amber-500/10 py-3 text-[12px] font-medium text-amber-700 active:scale-[0.97] dark:text-amber-400"
                    >
                      <IconBreakfast className="size-5" />
                      조식
                    </Link>
                    <Link
                      href={`/trip/${trip.id}/transport`}
                      className="flex flex-col items-center gap-1 rounded-2xl bg-blue-500/10 py-3 text-[12px] font-medium text-blue-700 active:scale-[0.97] dark:text-blue-400"
                    >
                      <IconTransport className="size-5" />
                      교통
                    </Link>
                    <Link
                      href={`/trip/${trip.id}/lodging`}
                      className="flex flex-col items-center gap-1 rounded-2xl bg-violet-500/10 py-3 text-[12px] font-medium text-violet-700 active:scale-[0.97] dark:text-violet-400"
                    >
                      <IconLodging className="size-5" />
                      숙박
                    </Link>
                    <Link
                      href={`/trip/${trip.id}/field`}
                      className="flex flex-col items-center gap-1 rounded-2xl bg-rose-500/10 py-3 text-[12px] font-medium text-rose-700 active:scale-[0.97] dark:text-rose-400"
                    >
                      <IconPhoto className="size-5" />
                      현장사진
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <TripForm />

      {completedTrips.length > 0 && (
        <section>
          <h2 className="px-1 text-[13px] font-medium uppercase tracking-wide text-neutral-400">
            종료된 출장
          </h2>
          <div className="mt-2 space-y-2">
            {completedTrips.map((trip) => {
              const departure = trip.stops.find((s) => s.type === "DEPARTURE");
              const arrival = trip.stops.find((s) => s.type === "ARRIVAL");
              return (
                <div
                  key={trip.id}
                  className="rounded-2xl border border-black/5 bg-white/80 p-4 shadow-sm transition dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/trip/${trip.id}`}
                      className="block min-w-0 flex-1 active:scale-[0.99]"
                    >
                      <p className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
                        {departure?.location ?? "?"} → {arrival?.location ?? "?"}
                      </p>
                      <p className="mt-0.5 text-[13px] text-neutral-500">
                        {formatDate(trip.startDate)} ~ {formatDate(trip.endDate)}
                      </p>
                    </Link>
                    <TripDeleteButton tripId={trip.id} label="삭제" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
