"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconPlus, IconTrash } from "./icons";
import DateYMDInput from "./DateYMDInput";
import { createTrip, updateTrip, type PositionGrade, type SettlementMode } from "@/lib/localDb";
import { POSITION_GRADE_LABEL } from "@/lib/transportFares";
import { useT } from "@/lib/i18n/LanguageProvider";

type Stop = {
  key: string;
  type: "DEPARTURE" | "STOPOVER" | "ARRIVAL";
  location: string;
};

type InitialStop = {
  type: "DEPARTURE" | "STOPOVER" | "ARRIVAL";
  location: string;
};

function newKey() {
  return Math.random().toString(36).slice(2);
}

function toStops(initial?: InitialStop[]): Stop[] {
  if (initial && initial.length >= 2) {
    return initial.map((s) => ({ key: newKey(), ...s }));
  }
  return [
    { key: newKey(), type: "DEPARTURE", location: "" },
    { key: newKey(), type: "ARRIVAL", location: "" },
  ];
}

/**
 * 출장 등록(신규)과 출장 정보 변경(연장/단축 등 기존 출장 수정)을 겸한다.
 * tripId가 있으면 수정 모드(localDb.updateTrip), 없으면 신규 등록(localDb.createTrip)이다.
 *
 * 출장기간(시작일~종료일)은 경로(출발지/경유지/목적지)와 분리된 별도 값이다. 예전에는 각 경로
 * 지점마다 날짜를 따로 받아 "도착일자"가 목적지 도착일인지 최종 복귀일인지 모호했는데(복귀 일정이
 * 반영 안 되는 문제), 이제는 "출장기간"이 복귀까지 포함한 전체 기간을 명시적으로 나타낸다.
 */
export default function TripForm({
  tripId,
  initialStartDate,
  initialEndDate,
  initialStops,
  onSaved,
  onCancel,
}: {
  tripId?: string;
  initialStartDate?: string; // "YYYY-MM-DD"
  initialEndDate?: string;
  initialStops?: InitialStop[];
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(tripId);
  const [startDate, setStartDate] = useState(initialStartDate ?? "");
  const [endDate, setEndDate] = useState(initialEndDate ?? "");
  const [stops, setStops] = useState<Stop[]>(() => toStops(initialStops));
  // 상세모드가 기존 시스템 기본값이다 - 간편모드는 조식/교통/숙박/현장사진 증빙만 모아
  // 발송하는 축소판으로 새로 추가된 옵션이다(2026-08-11).
  const [mode, setMode] = useState<SettlementMode>("SIMPLE");
  // 기본값은 비활성화(수동입력) - 무료 OCR 모델의 인식 오류/오탐이 실사용에서 반복 확인돼,
  // 자동정산은 사용자가 명시적으로 켜기로 선택한 경우에만 쓰도록 한다. (2026-08-07)
  const [autoSettlement, setAutoSettlement] = useState(false);
  // 고속철도(KTX) 요금이 직급별로 달라(TRANS/ktx.xls) 출장 등록 시 받아 고정한다 - autoSettlement와
  // 마찬가지로 등록 후에는 바꿀 수 없다(이미 조회한 구간 요금과 어긋나지 않도록).
  const [grade, setGrade] = useState<PositionGrade | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  // 출장기간 종료일을 아직 안 만졌으면(비어 있으면) 시작일과 같은 값으로 미리 채워둔다 -
  // 당일 출장이 흔해서, 시작일만 넣으면 바로 완성되고, 여러 날이면 그냥 종료일을 고쳐 쓰면
  // 된다(2026-08-10, 사용자 요청). 종료일에 이미 값이 있으면(사용자가 이미 고른 경우) 건드리지
  // 않는다.
  function handleStartDateChange(next: string) {
    setStartDate(next);
    if (!endDate) setEndDate(next);
  }

  function updateStop(key: string, patch: Partial<Stop>) {
    setStops((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addStopover() {
    setStops((prev) => {
      const arrivalIdx = prev.findIndex((s) => s.type === "ARRIVAL");
      const next = [...prev];
      next.splice(arrivalIdx, 0, {
        key: newKey(),
        type: "STOPOVER",
        location: "",
      });
      return next;
    });
  }

  function removeStopover(key: string) {
    setStops((prev) => prev.filter((s) => s.key !== key));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      setError(t.tripForm.errorDateRequired);
      return;
    }
    if (endDate < startDate) {
      setError(t.tripForm.errorEndBeforeStart);
      return;
    }
    if (stops.some((s) => !s.location.trim())) {
      setError(t.tripForm.errorLocationRequired);
      return;
    }
    if (!isEdit && mode === "DETAILED" && !grade) {
      setError(t.tripForm.errorGradeRequired);
      return;
    }

    setSubmitting(true);
    try {
      const stopsInput = stops.map(({ type, location }, order) => ({ type, location, order }));
      if (isEdit && tripId) {
        await updateTrip(tripId, { startDate, endDate, stops: stopsInput });
        setSubmitting(false);
        onSaved?.();
      } else {
        const trip = await createTrip({
          startDate,
          endDate,
          stops: stopsInput,
          settlementMode: mode,
          autoSettlement: mode === "DETAILED" && autoSettlement,
          grade: mode === "DETAILED" ? grade : null,
        });
        router.push(`/trip/${trip.id}`);
      }
    } catch {
      setError(t.tripForm.errorSaveFailed);
      setSubmitting(false);
    }
  }

  const badgeStyle: Record<Stop["type"], string> = {
    DEPARTURE: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    STOPOVER: "bg-neutral-500/10 text-neutral-500 dark:text-neutral-400",
    ARRIVAL: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };
  const badgeLabel = t.tripForm.stopLabel;

  return (
    <form
      onSubmit={handleSubmit}
      className="shadow-glow rounded-[28px] border border-brand/10 bg-white/90 p-5 backdrop-blur dark:border-white/10 dark:bg-white/[0.04] sm:p-6"
    >
      <h2 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        {isEdit ? t.tripForm.titleEdit : t.tripForm.titleNew}
      </h2>
      {isEdit && (
        <p className="mt-1 text-[12.5px] text-neutral-500">{t.tripForm.editHint}</p>
      )}

      <div className="mt-4 rounded-2xl border border-black/5 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/5">
        <p className="text-[13px] font-medium text-neutral-500">{t.tripForm.period}</p>
        <div className="mt-2 flex flex-nowrap items-center gap-1 overflow-x-auto">
          <DateYMDInput value={startDate} onChange={handleStartDateChange} />
          <span className="shrink-0 text-neutral-400">~</span>
          <DateYMDInput value={endDate} onChange={setEndDate} />
        </div>
      </div>

      {!isEdit && (
        <div className="mt-4 rounded-2xl border border-black/5 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMode("SIMPLE")}
              className={`text-[14px] font-semibold transition ${
                mode === "SIMPLE" ? "text-brand dark:text-brand-light" : "text-neutral-400"
              }`}
            >
              {t.tripForm.simpleMode}
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={mode === "DETAILED"}
              aria-label={t.tripForm.modeToggleAria}
              onClick={() => setMode((m) => (m === "SIMPLE" ? "DETAILED" : "SIMPLE"))}
              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                mode === "DETAILED" ? "bg-brand" : "bg-neutral-300 dark:bg-white/20"
              }`}
            >
              <span
                className={`inline-block size-5 transform rounded-full bg-white shadow transition-transform ${
                  mode === "DETAILED" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => setMode("DETAILED")}
              className={`text-[14px] font-semibold transition ${
                mode === "DETAILED" ? "text-brand dark:text-brand-light" : "text-neutral-400"
              }`}
            >
              {t.tripForm.detailedMode}
            </button>
          </div>
          <p className="mt-2 text-[12px] text-neutral-400">
            {mode === "SIMPLE" ? t.tripForm.simpleModeDesc : t.tripForm.detailedModeDesc}
          </p>

          {mode === "DETAILED" && (
            <div className="mt-3 space-y-3 border-t border-black/5 pt-3 dark:border-white/10">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">
                    {t.tripForm.autoSettlementTitle}
                  </p>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoSettlement}
                    aria-label={t.tripForm.autoSettlementAria}
                    onClick={() => setAutoSettlement((v) => !v)}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                      autoSettlement ? "bg-brand" : "bg-neutral-300 dark:bg-white/20"
                    }`}
                  >
                    <span
                      className={`inline-block size-5 transform rounded-full bg-white shadow transition-transform ${
                        autoSettlement ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                <p className="mt-1 text-[12px] text-neutral-400">
                  {autoSettlement ? t.tripForm.autoSettlementOnDesc : t.tripForm.autoSettlementOffDesc}
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-black/5 pt-3 dark:border-white/10">
                <p className="text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">
                  {t.tripForm.positionGradeTitle}
                </p>
                <div className="flex shrink-0 rounded-full bg-neutral-200/70 p-0.5 dark:bg-white/10">
                  {(Object.keys(POSITION_GRADE_LABEL) as PositionGrade[]).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGrade(g)}
                      className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
                        grade === g
                          ? "bg-white text-brand shadow-sm dark:bg-white/90"
                          : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    >
                      {t.positionGrade[g]}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-neutral-400">{t.tripForm.lockedHint}</p>
            </div>
          )}
        </div>
      )}

      {(() => {
        const departureStop = stops.find((s) => s.type === "DEPARTURE");
        const arrivalStop = stops.find((s) => s.type === "ARRIVAL");
        const stopoverStops = stops.filter((s) => s.type === "STOPOVER");
        const stopField = (s: Stop) => (
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-black/5 bg-neutral-50 p-2 pl-3 dark:border-white/10 dark:bg-white/5">
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badgeStyle[s.type]}`}>
              {badgeLabel[s.type]}
            </span>
            <input
              type="text"
              required
              placeholder={t.tripForm.locationPlaceholder}
              value={s.location}
              onChange={(e) => updateStop(s.key, { location: e.target.value })}
              className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-2 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
            />
          </div>
        );
        return (
          <div className="mt-4 space-y-2">
            {departureStop && arrivalStop && (
              <div className="flex items-center gap-1.5">
                {stopField(departureStop)}
                <span className="shrink-0 text-neutral-300 dark:text-neutral-600">→</span>
                {stopField(arrivalStop)}
                <button
                  type="button"
                  onClick={addStopover}
                  aria-label={t.tripForm.addStopoverAria}
                  title={t.tripForm.addStopoverAria}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-brand/25 text-brand hover:bg-brand/5 dark:border-white/20 dark:text-brand-light"
                >
                  <IconPlus className="size-4" />
                </button>
              </div>
            )}
            {stopoverStops.map((s) => (
              <div
                key={s.key}
                className="flex items-center gap-2 rounded-2xl border border-black/5 bg-neutral-50 p-2 pl-3 dark:border-white/10 dark:bg-white/5"
              >
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badgeStyle.STOPOVER}`}>
                  {badgeLabel.STOPOVER}
                </span>
                <input
                  type="text"
                  required
                  placeholder={t.tripForm.locationPlaceholder}
                  value={s.location}
                  onChange={(e) => updateStop(s.key, { location: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-2 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => removeStopover(s.key)}
                  className="shrink-0 rounded-full p-2 text-neutral-400 hover:bg-black/5 hover:text-red-500 dark:hover:bg-white/10"
                  aria-label={t.tripForm.removeStopoverAria}
                >
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>
        );
      })()}

      {error && (
        <p className="mt-3 text-[13px] text-red-500">{error}</p>
      )}

      <div className="mt-5 flex gap-2">
        {isEdit && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 rounded-2xl border border-black/10 py-3 text-[15px] font-medium text-neutral-600 disabled:opacity-50 dark:border-white/15 dark:text-neutral-300"
          >
            {t.tripForm.cancel}
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="shadow-glow flex-1 rounded-full bg-brand py-3 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
        >
          {submitting ? t.tripForm.saving : isEdit ? t.tripForm.saveChanges : t.tripForm.startTrip}
        </button>
      </div>
    </form>
  );
}
