"use client";

import { useState } from "react";
import { updateTrip } from "@/lib/localDb";
import { tripTotalDays } from "@/lib/settlementFormat";
import { IconMinus, IconPlus } from "./icons";
import { useLocale, useT } from "@/lib/i18n/LanguageProvider";

/** 하루 최대 3식(조/중/석)까지만 공제할 수 있다 - 그 이상은 출장 기간을 넘어서는 값이라
 * 의미가 없다(2026-08-11, 사용자 요청. 예: 1일 출장이면 최대 3식). */
const MAX_MEALS_PER_DAY = 3;

/**
 * 조식 화면에 항상 보이는 "N식 식비공제(선택)" - 사진 등록 여부와 무관하게 언제든 값을 바꿀 수
 * 있다(2026-08-10, 사용자 요청). 이미 식사가 제공된 날수만큼 선택하면, PDF 정산(안) 산식에서
 * 1식당 15,000원씩 추가로 빠진다. 기본값 0식은 공제 없음을 뜻한다.
 */
export default function MealDeductionStepper({
  tripId,
  value,
  tripStartDate,
  tripEndDate,
  onChanged,
}: {
  tripId: string;
  value: number;
  tripStartDate: string;
  tripEndDate: string;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const maxCount = MAX_MEALS_PER_DAY * tripTotalDays(tripStartDate, tripEndDate);
  const t = useT();
  const { locale } = useLocale();
  const countText = locale === "ko" ? `${value}${t.mealDeduction.unit}` : `${value} ${t.mealDeduction.unit}${value === 1 ? "" : "s"}`;

  async function change(next: number) {
    if (next < 0 || next > maxCount || saving) return;
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
          {t.mealDeduction.title}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => change(value - 1)}
          disabled={saving || value <= 0}
          aria-label={t.mealDeduction.decreaseAria}
          className="flex size-8 items-center justify-center rounded-full bg-neutral-200/70 text-neutral-700 disabled:opacity-40 dark:bg-white/10 dark:text-neutral-200"
        >
          <IconMinus className="size-4" />
        </button>
        <span className="w-16 text-center text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
          {countText}
        </span>
        <button
          type="button"
          onClick={() => change(value + 1)}
          disabled={saving || value >= maxCount}
          aria-label={t.mealDeduction.increaseAria}
          className="flex size-8 items-center justify-center rounded-full bg-neutral-200/70 text-neutral-700 disabled:opacity-40 dark:bg-white/10 dark:text-neutral-200"
        >
          <IconPlus className="size-4" />
        </button>
      </div>
    </div>
  );
}
