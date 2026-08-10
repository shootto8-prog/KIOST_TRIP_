"use client";

import { useState } from "react";
import { updateTrip } from "@/lib/localDb";
import { IconMinus, IconPlus } from "./icons";

/**
 * 조식 화면에 항상 보이는 "N식 식비공제(선택)" - 사진 등록 여부와 무관하게 언제든 값을 바꿀 수
 * 있다(2026-08-10, 사용자 요청). 이미 식사가 제공된 날수만큼 선택하면, PDF 정산(안) 산식에서
 * 1식당 15,000원씩 추가로 빠진다. 기본값 0식은 공제 없음을 뜻한다.
 */
export default function MealDeductionStepper({
  tripId,
  value,
  onChanged,
}: {
  tripId: string;
  value: number;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function change(next: number) {
    if (next < 0 || saving) return;
    setSaving(true);
    try {
      await updateTrip(tripId, { mealDeductionCount: next });
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="shadow-soft flex items-center justify-between gap-3 rounded-[24px] border border-black/5 bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">
          식비공제(선택)
        </p>
        <p className="mt-0.5 text-[12px] text-neutral-400">
          이미 제공된 식사 수만큼 선택하면 정산서에서 1식당 15,000원씩 빠집니다.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => change(value - 1)}
          disabled={saving || value <= 0}
          aria-label="식비공제 1식 줄이기"
          className="flex size-8 items-center justify-center rounded-full bg-neutral-200/70 text-neutral-700 disabled:opacity-40 dark:bg-white/10 dark:text-neutral-200"
        >
          <IconMinus className="size-4" />
        </button>
        <span className="w-12 text-center text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
          {value}식
        </span>
        <button
          type="button"
          onClick={() => change(value + 1)}
          disabled={saving}
          aria-label="식비공제 1식 늘리기"
          className="flex size-8 items-center justify-center rounded-full bg-neutral-200/70 text-neutral-700 disabled:opacity-40 dark:bg-white/10 dark:text-neutral-200"
        >
          <IconPlus className="size-4" />
        </button>
      </div>
    </div>
  );
}
