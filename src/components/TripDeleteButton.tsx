"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "./icons";
import { deleteTrip } from "@/lib/localDb";
import { useLocale, useT } from "@/lib/i18n/LanguageProvider";
import { buildDeleteAriaLabel, buildDeleteConfirmMessage, tripDeleteLabel, type DeleteKind } from "@/lib/i18n/messages/tripDelete";

/**
 * 진행중인 출장은 "취소", 종료된 출장은 "삭제"로 라벨만 다르고 동작은 동일하다(둘 다 완전 삭제,
 * 되돌릴 수 없음 - 등록된 영수증/이미지도 함께 지워진다). 실수 방지를 위해 확인창을 거친다.
 * 라벨 자체가 한국어 리터럴이면 번역이 불가능해서, 의미(kind)만 받고 표시 문구는
 * useLocale()로 내부에서 조립한다.
 */
export default function TripDeleteButton({
  tripId,
  kind,
  className,
  redirectTo,
  onDeleted,
}: {
  tripId: string;
  kind: DeleteKind;
  className?: string;
  redirectTo?: string; // 지정하면 삭제 후 이 경로로 이동 (예: 허브 화면에서 지울 때 홈으로)
  onDeleted?: () => void; // redirectTo가 없을 때(목록 화면) 삭제 후 목록을 다시 불러오기 위한 콜백
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const label = tripDeleteLabel(locale, kind);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm(buildDeleteConfirmMessage(locale, kind));
    if (!confirmed) return;

    setLoading(true);
    try {
      await deleteTrip(tripId);
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        onDeleted?.();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      aria-label={buildDeleteAriaLabel(locale, kind)}
      className={
        className ??
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
      }
    >
      <IconTrash className="size-3.5" />
      {loading ? t.common.processing : label}
    </button>
  );
}
