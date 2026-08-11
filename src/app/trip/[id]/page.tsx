"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import CategoryCard from "@/components/CategoryCard";
import EmailSendButton from "@/components/EmailSendButton";
import PdfDownloadButton from "@/components/PdfDownloadButton";
import TripRouteSection from "@/components/TripRouteSection";
import TripStatusButton from "@/components/TripStatusButton";
import TripDeleteButton from "@/components/TripDeleteButton";
import LocalDataBoundary from "@/components/LocalDataBoundary";
import { IconBreakfast, IconTransport, IconLodging, IconFieldPhoto, IconChevronLeft } from "@/components/icons";
import { useTrip } from "@/lib/useLocalTrip";
import { useReceipts } from "@/lib/useLocalReceipts";
import { summarizeByCategory } from "@/lib/tripSummaryLocal";

export default function TripHubPage() {
  const { id } = useParams<{ id: string }>();
  const { status: tripStatus, trip, refresh } = useTrip(id);
  const { status: receiptsStatus, receipts } = useReceipts(id);
  const { byCategory, sumByCategory } = summarizeByCategory(receipts);
  const isCompleted = trip?.status === "COMPLETED";
  // isEmailConfigured()는 process.env.SMTP_*를 읽는데 이 값은 서버에서만 채워지므로, 이 클라이언트
  // 컴포넌트에서 직접 부르면 항상 false가 나온다 - /api/email-status로 서버 판정을 받아온다
  // (2026-08-10, "준비 중" 배너가 SMTP 설정과 무관하게 항상 뜨던 버그 수정).
  const [emailEnabled, setEmailEnabled] = useState(false);
  useEffect(() => {
    fetch("/api/email-status")
      .then((res) => res.json())
      .then((data) => setEmailEnabled(Boolean(data?.enabled)))
      .catch(() => setEmailEnabled(false));
  }, []);

  return (
    <LocalDataBoundary
      loading={tripStatus === "loading" || receiptsStatus === "loading"}
      notFound={tripStatus === "not-found"}
    >
      {trip && (
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
            startDate={trip.startDate}
            endDate={trip.endDate}
            stops={trip.stops}
            onUpdated={refresh}
          />

          {isCompleted ? (
            <section className="shadow-glow rounded-[28px] bg-brand p-5 text-white">
              {!trip.autoSettlement && (
                <>
                  <p className="text-[13px] font-medium text-blue-100">자동정산 미사용</p>
                  <p className="mt-1 text-[15px] font-semibold leading-relaxed">
                    제출된 증빙 서류는 담당자가 직접 확인해 정산 금액을 확정합니다.
                  </p>
                </>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <PdfDownloadButton
                  tripId={id}
                  label={trip.autoSettlement ? "정산 결과 PDF 다운로드" : "제출 서류 PDF 다운로드"}
                />
                <EmailSendButton tripId={id} trip={trip} receipts={receipts} enabled={emailEnabled} />
              </div>
            </section>
          ) : null}

          <section className="grid grid-cols-2 gap-3">
            <CategoryCard
              href={`/trip/${id}/breakfast`}
              icon={<IconBreakfast className="size-20" />}
              label="조식"
              count={byCategory.BREAKFAST.length}
              amount={sumByCategory.BREAKFAST}
              autoSettlement={trip.autoSettlement}
            />
            <CategoryCard
              href={`/trip/${id}/transport`}
              icon={<IconTransport className="size-20" />}
              label="교통"
              count={byCategory.TRANSPORT.length}
              amount={sumByCategory.TRANSPORT}
              autoSettlement={trip.autoSettlement}
            />
            <CategoryCard
              href={`/trip/${id}/lodging`}
              icon={<IconLodging className="size-20" />}
              label="숙박"
              count={byCategory.LODGING.length}
              amount={sumByCategory.LODGING}
              autoSettlement={trip.autoSettlement}
            />
            <CategoryCard
              href={`/trip/${id}/field`}
              icon={<IconFieldPhoto className="size-20" />}
              label="현장사진"
              count={byCategory.FIELD.length}
              amount={sumByCategory.FIELD}
              autoSettlement={trip.autoSettlement}
            />
          </section>

          <div className="flex flex-col items-center gap-3">
            <TripStatusButton tripId={id} status={trip.status} onChanged={refresh} />
            <TripDeleteButton
              tripId={id}
              label={isCompleted ? "삭제" : "취소"}
              redirectTo="/"
              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-red-500 hover:bg-red-500/10"
            />
          </div>
        </main>
      )}
    </LocalDataBoundary>
  );
}
