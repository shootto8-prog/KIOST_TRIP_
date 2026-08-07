import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import CategoryCard from "@/components/CategoryCard";
import EmailSendButton from "@/components/EmailSendButton";
import TripRouteSection from "@/components/TripRouteSection";
import TripStatusButton from "@/components/TripStatusButton";
import TripDeleteButton from "@/components/TripDeleteButton";
import { isEmailConfigured } from "@/lib/sendEmail";
import { IconBreakfast, IconTransport, IconLodging, IconFieldPhoto, IconChevronLeft, IconDownload } from "@/components/icons";

export default async function TripHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [trip, breakfast, transport, lodging, field] = await Promise.all([
    prisma.trip.findUnique({
      where: { id },
      include: { stops: { orderBy: { order: "asc" } } },
    }),
    prisma.receipt.aggregate({
      where: { tripId: id, category: "BREAKFAST" },
      _count: { _all: true },
      _sum: { verdictAmount: true },
    }),
    prisma.receipt.aggregate({
      where: { tripId: id, category: "TRANSPORT" },
      _count: { _all: true },
      _sum: { verdictAmount: true },
    }),
    prisma.receipt.aggregate({
      where: { tripId: id, category: "LODGING" },
      _count: { _all: true },
      _sum: { verdictAmount: true },
    }),
    prisma.receipt.aggregate({
      where: { tripId: id, category: "FIELD" },
      _count: { _all: true },
      _sum: { verdictAmount: true },
    }),
  ]);
  if (!trip) notFound();
  const totalAmount =
    (breakfast._sum.verdictAmount ?? 0) +
    (transport._sum.verdictAmount ?? 0) +
    (lodging._sum.verdictAmount ?? 0);
  const isCompleted = trip.status === "COMPLETED";

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-[14px] font-medium text-brand dark:text-brand-light"
        >
          <IconChevronLeft className="size-5" />
          출장 목록
        </Link>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            isCompleted
              ? "bg-neutral-500/10 text-neutral-500"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {isCompleted ? "종료됨" : "진행중"}
        </span>
      </div>

      <TripRouteSection
        tripId={id}
        ownerEmail={trip.ownerEmail}
        startDate={trip.startDate.toISOString()}
        endDate={trip.endDate.toISOString()}
        stops={trip.stops.map((s) => ({
          id: s.id,
          type: s.type,
          location: s.location,
        }))}
      />

      {isCompleted ? (
        <section className="shadow-glow rounded-[28px] bg-brand p-5 text-white">
          {trip.autoSettlement ? (
            <>
              <p className="text-[13px] font-medium text-blue-100">최종 인정된 실비 합계</p>
              <p className="mt-1 text-3xl font-bold tracking-tight">
                {totalAmount.toLocaleString("ko-KR")}원
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-medium text-blue-100">자동정산 미사용</p>
              <p className="mt-1 text-[15px] font-semibold leading-relaxed">
                제출된 증빙 서류는 담당자가 직접 확인해 정산 금액을 확정합니다.
              </p>
            </>
          )}
          <a
            href={`/api/trips/${id}/pdf`}
            download
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-[14px] font-semibold text-white backdrop-blur transition hover:bg-white/25"
          >
            <IconDownload className="size-5" />
            {trip.autoSettlement ? "정산 결과 PDF 다운로드" : "제출 서류 PDF 다운로드"}
          </a>
          <EmailSendButton tripId={id} enabled={isEmailConfigured()} defaultEmail={trip.ownerEmail ?? undefined} />
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3">
        <CategoryCard
          href={`/trip/${id}/breakfast`}
          icon={<IconBreakfast className="size-20" />}
          label="조식"
          count={breakfast._count._all}
          amount={breakfast._sum.verdictAmount ?? 0}
          autoSettlement={trip.autoSettlement}
        />
        <CategoryCard
          href={`/trip/${id}/transport`}
          icon={<IconTransport className="size-20" />}
          label="교통"
          count={transport._count._all}
          amount={transport._sum.verdictAmount ?? 0}
          autoSettlement={trip.autoSettlement}
        />
        <CategoryCard
          href={`/trip/${id}/lodging`}
          icon={<IconLodging className="size-20" />}
          label="숙박"
          count={lodging._count._all}
          amount={lodging._sum.verdictAmount ?? 0}
          autoSettlement={trip.autoSettlement}
        />
        <CategoryCard
          href={`/trip/${id}/field`}
          icon={<IconFieldPhoto className="size-20" />}
          label="현장사진"
          count={field._count._all}
          amount={field._sum.verdictAmount ?? 0}
          autoSettlement={trip.autoSettlement}
        />
      </section>

      <div className="flex flex-col items-center gap-3">
        <TripStatusButton tripId={id} status={trip.status} />
        <TripDeleteButton
          tripId={id}
          label={isCompleted ? "삭제" : "취소"}
          redirectTo="/"
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-red-500 hover:bg-red-500/10"
        />
      </div>
    </main>
  );
}
