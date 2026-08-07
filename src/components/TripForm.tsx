"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconPlus, IconTrash } from "./icons";
import DateYMDInput from "./DateYMDInput";

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
 * tripId가 있으면 수정 모드(PATCH /api/trips/[id]), 없으면 신규 등록(POST /api/trips)이다.
 *
 * 출장기간(시작일~종료일)은 경로(출발지/경유지/목적지)와 분리된 별도 값이다. 예전에는 각 경로
 * 지점마다 날짜를 따로 받아 "도착일자"가 목적지 도착일인지 최종 복귀일인지 모호했는데(복귀 일정이
 * 반영 안 되는 문제), 이제는 "출장기간"이 복귀까지 포함한 전체 기간을 명시적으로 나타낸다.
 */
export default function TripForm({
  tripId,
  ownerEmail,
  initialStartDate,
  initialEndDate,
  initialStops,
  onSaved,
  onCancel,
}: {
  tripId?: string;
  /** 홈 화면의 본인 확인 이메일(identity 쿠키) - 새 출장 등록 시 자동으로 연결된다. */
  ownerEmail: string;
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
  const [autoSettlement, setAutoSettlement] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("출장 시작일과 종료일을 연도(4자리)까지 포함해, 실제로 있는 날짜로 입력해 주세요.");
      return;
    }
    if (endDate < startDate) {
      setError("종료일이 시작일보다 빠를 수 없습니다.");
      return;
    }
    if (stops.some((s) => !s.location.trim())) {
      setError("모든 경로 항목에 장소를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const url = isEdit ? `/api/trips/${tripId}` : "/api/trips";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerEmail,
          startDate,
          endDate,
          stops: stops.map(({ type, location }) => ({ type, location })),
          // 등록(신규) 시에만 의미가 있다 - 등록 후에는 바꿀 수 없어 수정 모드에서는 아예 보내지
          // 않는다(PATCH 라우트도 이 필드를 다루지 않는다).
          ...(isEdit ? {} : { autoSettlement }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      if (isEdit) {
        setSubmitting(false);
        onSaved?.();
        router.refresh();
      } else {
        router.push(`/trip/${data.trip.id}`);
        router.refresh();
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  const badgeStyle: Record<Stop["type"], string> = {
    DEPARTURE: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    STOPOVER: "bg-neutral-500/10 text-neutral-500 dark:text-neutral-400",
    ARRIVAL: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  };
  const badgeLabel: Record<Stop["type"], string> = {
    DEPARTURE: "출발지",
    STOPOVER: "경유지",
    ARRIVAL: "목적지",
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="shadow-glow rounded-[28px] border border-brand/10 bg-white/90 p-5 backdrop-blur dark:border-white/10 dark:bg-white/[0.04] sm:p-6"
    >
      <h2 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        {isEdit ? "출장 정보 변경" : "출장정보"}
      </h2>
      {isEdit && (
        <p className="mt-1 text-[12.5px] text-neutral-500">
          출장이 연장·단축되거나 경유지가 바뀐 경우 여기서 수정하세요.
        </p>
      )}

      <div className="mt-4 rounded-2xl border border-black/5 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/5">
        <p className="text-[13px] font-medium text-neutral-500">
          출장기간 <span className="font-normal text-neutral-400">(복귀 완료일까지 포함)</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DateYMDInput value={startDate} onChange={setStartDate} />
          <span className="text-neutral-400">~</span>
          <DateYMDInput value={endDate} onChange={setEndDate} />
        </div>
      </div>

      {!isEdit && (
        <div className="mt-4 rounded-2xl border border-black/5 bg-neutral-50 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">
                자동정산 (AI 판정)
              </p>
              <p className="mt-0.5 text-[12px] text-neutral-400">
                {autoSettlement
                  ? "사진을 올리면 AI가 규정에 따라 인정/불인정을 자동으로 판정합니다."
                  : "AI 판정 없이 증빙 사진만 제출합니다. 담당자가 직접 확인해 정산합니다."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoSettlement}
              aria-label="자동정산 사용 여부"
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
          <p className="mt-2 text-[11px] text-neutral-400">
            출장 등록 후에는 바꿀 수 없어요. 신중히 선택해 주세요.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {stops.map((s) => (
          <div
            key={s.key}
            className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/5 bg-neutral-50 p-2 pl-3 dark:border-white/10 dark:bg-white/5"
          >
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badgeStyle[s.type]}`}
            >
              {badgeLabel[s.type]}
            </span>
            <input
              type="text"
              required
              placeholder="장소 (예: 부산)"
              value={s.location}
              onChange={(e) => updateStop(s.key, { location: e.target.value })}
              className="min-w-0 flex-1 rounded-xl bg-transparent px-2 py-2 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
            />
            {s.type === "STOPOVER" && (
              <button
                type="button"
                onClick={() => removeStopover(s.key)}
                className="shrink-0 rounded-full p-2 text-neutral-400 hover:bg-black/5 hover:text-red-500 dark:hover:bg-white/10"
                aria-label="경유지 삭제"
              >
                <IconTrash />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addStopover}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-brand/20 py-2.5 text-[14px] font-medium text-brand hover:bg-brand/5 dark:border-white/15 dark:text-brand-light"
      >
        <IconPlus />
        경유지 추가
      </button>

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
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="shadow-glow flex-1 rounded-full bg-brand py-3 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
        >
          {submitting ? "저장 중..." : isEdit ? "변경 사항 저장" : "출장 시작"}
        </button>
      </div>
    </form>
  );
}
