import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import NewTripSection from "@/components/NewTripSection";
import TripDeleteButton from "@/components/TripDeleteButton";
import IdentityPrompt from "@/components/IdentityPrompt";
import IdentitySwitcher from "@/components/IdentitySwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { getOwnerEmail } from "@/lib/identity";
import { IconBreakfast, IconTransport, IconLodging, IconFieldPhoto } from "@/components/icons";

// 출장 목록은 매 요청마다 최신 상태를 보여줘야 한다 - 빌드 시점에 정적으로 고정되면
// 새로 등록/종료된 출장이 재배포 전까지 반영되지 않는다.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ownerEmail = await getOwnerEmail();

  if (!ownerEmail) {
    return (
      <main className="space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              정총무<span className="text-brand">1.0</span>
            </h1>
            <p className="mt-1 text-[14px] text-neutral-500">
              출장정보를 등록하고 조식·교통·숙박·현장사진을 관리하세요.
            </p>
          </div>
          <ThemeToggle />
        </header>
        <IdentityPrompt />
      </main>
    );
  }

  const [activeTrips, completedTrips] = await Promise.all([
    prisma.trip.findMany({
      where: { status: "ACTIVE", ownerEmail },
      orderBy: { createdAt: "desc" },
      include: { stops: { orderBy: { order: "asc" } } },
    }),
    prisma.trip.findMany({
      where: { status: "COMPLETED", ownerEmail },
      orderBy: { updatedAt: "desc" },
      include: { stops: { orderBy: { order: "asc" } } },
      take: 10,
    }),
  ]);

  return (
    <main className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            정총무<span className="text-brand">1.0</span>
          </h1>
          <p className="mt-1 text-[14px] text-neutral-500">
            출장정보를 등록하고 조식·교통·숙박·현장사진을 관리하세요.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <IdentitySwitcher email={ownerEmail} />
        </div>
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
                  className="shadow-glow rounded-[28px] border border-brand/10 bg-white/90 p-4 dark:border-white/10 dark:bg-white/[0.04]"
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
                      className="flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[12px] font-medium text-neutral-600 active:scale-[0.97] dark:text-neutral-300"
                    >
                      <IconBreakfast className="size-10" />
                      조식
                    </Link>
                    <Link
                      href={`/trip/${trip.id}/transport`}
                      className="flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[12px] font-medium text-neutral-600 active:scale-[0.97] dark:text-neutral-300"
                    >
                      <IconTransport className="size-10" />
                      교통
                    </Link>
                    <Link
                      href={`/trip/${trip.id}/lodging`}
                      className="flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[12px] font-medium text-neutral-600 active:scale-[0.97] dark:text-neutral-300"
                    >
                      <IconLodging className="size-10" />
                      숙박
                    </Link>
                    <Link
                      href={`/trip/${trip.id}/field`}
                      className="flex flex-col items-center gap-1.5 rounded-[20px] py-3 text-[12px] font-medium text-neutral-600 active:scale-[0.97] dark:text-neutral-300"
                    >
                      <IconFieldPhoto className="size-10" />
                      현장사진
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <NewTripSection ownerEmail={ownerEmail} />

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
                  className="shadow-soft rounded-2xl border border-black/5 bg-white/80 p-4 transition hover:border-brand/15 dark:border-white/10 dark:bg-white/[0.04]"
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
