"use client";

import { useState } from "react";
import TripForm from "./TripForm";
import { IconPlus } from "./icons";

/**
 * 출장정보 등록 폼은 세로로 길어 홈 화면에 항상 펼쳐두면 스크롤 없이 한 화면에 들어오기
 * 어렵다 - 기본은 접어두고, 버튼을 눌렀을 때만 펼친다.
 */
export default function NewTripSection() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shadow-soft flex w-full items-center justify-center gap-2 rounded-[28px] border border-dashed border-brand/25 bg-white/70 py-4 text-[15px] font-semibold text-brand active:scale-[0.99] dark:border-white/15 dark:bg-white/[0.03] dark:text-brand-light"
      >
        <IconPlus className="size-4" />
        새 출장 등록
      </button>
    );
  }

  return <TripForm />;
}
