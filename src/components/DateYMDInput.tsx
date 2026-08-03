"use client";

import { useRef, useState } from "react";
import { IconCalendar } from "./icons";

function parse(value: string) {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { y: m[1], m: m[2], d: m[3] } : { y: "", m: "", d: "" };
}

/**
 * 네이티브 <input type="date">는 OS/브라우저 로케일 설정에 따라 연도가 2자리로 표시될 수 있어
 * (내부 값은 항상 4자리지만 화면 렌더링은 로케일이 결정), 연도 표시를 직접 통제하기 위해
 * 년/월/일을 분리된 숫자 입력으로 받는다. 연도는 항상 4자리를 다 입력해야 값이 완성된다.
 *
 * 다만 이 방식만 쓰면 네이티브 달력 피커(캘린더 아이콘)가 사라져 날짜를 눈으로 보고 고르기 불편해진다.
 * 그래서 화면에는 보이지 않는 <input type="date">를 하나 더 두고, 달력 버튼을 누르면
 * showPicker()로 그 네이티브 피커만 열어 날짜를 고르게 한 뒤 결과를 년/월/일 입력에 반영한다.
 */
export default function DateYMDInput({
  value,
  onChange,
}: {
  value: string; // "" 또는 "YYYY-MM-DD"
  onChange: (next: string) => void;
}) {
  const [parts, setParts] = useState(() => parse(value));
  const pickerRef = useRef<HTMLInputElement>(null);

  function set(part: "y" | "m" | "d", raw: string, maxLen: number) {
    const digits = raw.replace(/\D/g, "").slice(0, maxLen);
    const next = { ...parts, [part]: digits };
    setParts(next);
    if (next.y.length === 4 && next.m.length > 0 && next.d.length > 0) {
      onChange(`${next.y}-${next.m.padStart(2, "0")}-${next.d.padStart(2, "0")}`);
    } else {
      onChange("");
    }
  }

  function openPicker() {
    const el = pickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // showPicker가 지원되지 않거나 실패하면 focus로 대체 시도
      }
    }
    el.focus();
  }

  function onPickerChange(raw: string) {
    const parsed = parse(raw);
    setParts(parsed);
    if (parsed.y && parsed.m && parsed.d) {
      onChange(`${parsed.y}-${parsed.m}-${parsed.d}`);
    }
  }

  const inputClass =
    "rounded-lg bg-transparent px-1 py-2 text-center text-[14px] text-neutral-900 outline-none dark:text-neutral-100";

  return (
    <div className="flex shrink-0 items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        placeholder="YYYY"
        value={parts.y}
        onChange={(e) => set("y", e.target.value, 4)}
        className={`w-14 ${inputClass}`}
      />
      <span className="text-[13px] text-neutral-400">년</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="MM"
        value={parts.m}
        onChange={(e) => set("m", e.target.value, 2)}
        className={`w-9 ${inputClass}`}
      />
      <span className="text-[13px] text-neutral-400">월</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="DD"
        value={parts.d}
        onChange={(e) => set("d", e.target.value, 2)}
        className={`w-9 ${inputClass}`}
      />
      <span className="text-[13px] text-neutral-400">일</span>

      <button
        type="button"
        onClick={openPicker}
        aria-label="달력에서 날짜 선택"
        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-black/5 hover:text-blue-600 dark:hover:bg-white/10 dark:hover:text-blue-400"
      >
        <IconCalendar />
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={parts.y && parts.m && parts.d ? `${parts.y}-${parts.m}-${parts.d}` : ""}
        onChange={(e) => onPickerChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />
    </div>
  );
}
