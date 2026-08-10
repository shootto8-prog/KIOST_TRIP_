"use client";

import { useState } from "react";
import { searchBusRoutes, searchCarRoutes, searchRailRoutes, type PositionGrade, type RouteSearchResult } from "@/lib/transportFares";
import { IconTrash, IconPlus } from "./icons";

export type RouteSelection = {
  route: string;
  label: string;
  /** 편도 요금(테이블에서 그대로 찾은 값) - 왕복/렌트·동승 여부는 여기 포함하지 않는다. */
  oneWayFare: number;
  roundTrip: boolean;
  /** 승용 전용 - 체크되면 요금이 0원으로 처리된다. */
  rent: boolean;
  carpool: boolean;
};

/** 최종 인정 금액 - 렌트/동승이면 무조건 0원, 아니면 왕복 여부에 따라 편도 요금의 1배/2배. */
export function resolveRouteFare(sel: RouteSelection): number {
  if (sel.rent || sel.carpool) return 0;
  return sel.roundTrip ? sel.oneWayFare * 2 : sel.oneWayFare;
}

function searchByMode(
  mode: "RAIL" | "PRIVATE_CAR" | "BUS",
  from: string,
  to: string,
  grade: PositionGrade
): RouteSearchResult[] {
  if (mode === "RAIL") return searchRailRoutes(from, to, grade);
  if (mode === "PRIVATE_CAR") return searchCarRoutes(from, to);
  return searchBusRoutes(from, to);
}

function RouteCard({
  transportMode,
  value,
  onChange,
  onRemove,
}: {
  transportMode: "RAIL" | "PRIVATE_CAR" | "BUS";
  value: RouteSelection;
  onChange: (next: RouteSelection) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2.5 rounded-xl border border-black/10 bg-white p-3 dark:border-white/15 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[14px] font-medium text-neutral-900 dark:text-neutral-100">
          {value.label}
        </p>
        <button
          type="button"
          onClick={onRemove}
          aria-label="구간 삭제"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-black/5 hover:text-red-500 dark:hover:bg-white/10"
        >
          <IconTrash className="size-4" />
        </button>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-[13.5px] text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={value.roundTrip}
            onChange={(e) => onChange({ ...value, roundTrip: e.target.checked })}
            className="size-4 rounded border-black/20 text-brand focus:ring-brand dark:border-white/30"
          />
          왕복
        </label>

        {transportMode === "PRIVATE_CAR" && (
          <>
            <label className="flex items-center gap-2 text-[13.5px] text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={value.rent}
                onChange={(e) => onChange({ ...value, rent: e.target.checked })}
                className="size-4 rounded border-black/20 text-brand focus:ring-brand dark:border-white/30"
              />
              렌트/공용차량
            </label>
            <label className="flex items-center gap-2 text-[13.5px] text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={value.carpool}
                onChange={(e) => onChange({ ...value, carpool: e.target.checked })}
                className="size-4 rounded border-black/20 text-brand focus:ring-brand dark:border-white/30"
              />
              동승
            </label>
          </>
        )}
      </div>

      {transportMode === "PRIVATE_CAR" && (value.rent || value.carpool) && (
        <p className="text-[12px] text-amber-600 dark:text-amber-400">
          렌트/동승은 정액 요금이 적용되지 않습니다.
        </p>
      )}
    </div>
  );
}

/**
 * 고속철도/승용/버스(정액정산 대상) 전용 구간 검색·선택 폼. 자유 입력 대신 TRANS 폴더 요금표에서
 * 검색해 고르게 해서, 오타/맞춤법으로 엉뚱한 구간이 등록되는 걸 막는다(2026-08-10).
 *
 * 경유·환승 등으로 한 번에 여러 구간을 등록해야 할 수 있어(2026-08-10, 사용자 요청), 값은
 * 하나가 아니라 배열이다 - 선택한 구간마다 카드로 쌓이고, "+"로 다음 구간을 계속 추가한다.
 */
export default function TransportRoutePicker({
  transportMode,
  grade,
  value,
  onChange,
  initialFrom = "",
  initialTo = "",
}: {
  transportMode: "RAIL" | "PRIVATE_CAR" | "BUS";
  grade: PositionGrade;
  value: RouteSelection[];
  onChange: (v: RouteSelection[]) => void;
  /** 출장정보에 등록한 출발지/목적지로 검색창을 미리 채워둔다(2026-08-10 - 매번 다시 치는 게
   * 번거롭다는 피드백). 이 구간과 다른 경유 구간이면 사용자가 그냥 지우고 다시 입력하면 된다. */
  initialFrom?: string;
  initialTo?: string;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  // 구간이 하나도 없을 땐 검색창을 바로 보여주고, 하나라도 있으면 "+"를 눌러야 다시 연다 -
  // 목록이 길어질수록 매번 검색창이 펼쳐져 있으면 오히려 산만해진다.
  const [adding, setAdding] = useState(value.length === 0);
  const results = searchByMode(transportMode, from, to, grade);
  const notFound = (from.trim().length > 0 || to.trim().length > 0) && results.length === 0;

  function selectResult(r: RouteSearchResult) {
    onChange([
      ...value,
      { route: r.route, label: r.label, oneWayFare: r.fare, roundTrip: false, rent: false, carpool: false },
    ]);
    setFrom(initialFrom);
    setTo(initialTo);
    setAdding(false);
  }

  function updateAt(idx: number, next: RouteSelection) {
    onChange(value.map((v, i) => (i === idx ? next : v)));
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      {value.map((sel, idx) => (
        <RouteCard
          key={`${sel.route}-${idx}`}
          transportMode={transportMode}
          value={sel}
          onChange={(next) => updateAt(idx, next)}
          onRemove={() => removeAt(idx)}
        />
      ))}

      {adding ? (
        <div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="출발 (예: 부산)"
              className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[15px] text-neutral-900 outline-none focus:border-brand dark:border-white/15 dark:bg-white/5 dark:text-neutral-100"
            />
            <span className="shrink-0 text-neutral-400">→</span>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="도착 (예: 경주)"
              className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[15px] text-neutral-900 outline-none focus:border-brand dark:border-white/15 dark:bg-white/5 dark:text-neutral-100"
            />
          </div>
          {results.length > 0 && (
            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-black/10 dark:border-white/15">
              {results.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => selectResult(r)}
                  className="w-full px-3 py-2.5 text-left text-[14px] text-neutral-800 hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/10"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {notFound && (
            <p className="mt-2 text-[13px] text-amber-600 dark:text-amber-400">
              입력되지 않은 구간입니다. 담당자에게 문의해주세요.
            </p>
          )}
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setFrom(initialFrom);
                setTo(initialTo);
              }}
              className="mt-2 text-[13px] font-medium text-neutral-400"
            >
              취소
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-[13.5px] font-medium text-brand dark:text-brand-light"
        >
          <IconPlus className="size-3.5" />
          구간 추가
        </button>
      )}
    </div>
  );
}
