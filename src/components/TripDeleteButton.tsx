"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "./icons";
import { deleteTrip } from "@/lib/localDb";

/**
 * 진행중인 출장은 "취소", 종료된 출장은 "삭제"로 라벨만 다르고 동작은 동일하다(둘 다 완전 삭제,
 * 되돌릴 수 없음 - 등록된 영수증/이미지도 함께 지워진다). 실수 방지를 위해 확인창을 거친다.
 */
export default function TripDeleteButton({
  tripId,
  label,
  className,
  redirectTo,
  onDeleted,
}: {
  tripId: string;
  label: "취소" | "삭제";
  className?: string;
  redirectTo?: string; // 지정하면 삭제 후 이 경로로 이동 (예: 허브 화면에서 지울 때 홈으로)
  onDeleted?: () => void; // redirectTo가 없을 때(목록 화면) 삭제 후 목록을 다시 불러오기 위한 콜백
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = window.confirm(
      `이 출장을 ${label}하시겠어요? 등록된 영수증도 함께 삭제되며 되돌릴 수 없습니다.`
    );
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
      aria-label={`출장 ${label}`}
      className={
        className ??
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
      }
    >
      <IconTrash className="size-3.5" />
      {loading ? "처리 중..." : label}
    </button>
  );
}
