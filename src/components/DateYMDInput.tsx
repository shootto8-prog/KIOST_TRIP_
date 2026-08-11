"use client";

import { useEffect, useRef, useState } from "react";
import { IconCalendar } from "./icons";
import { isValidYmdParts } from "@/lib/ymdDate";

function parse(value: string) {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? { y: m[1], m: m[2], d: m[3] } : { y: "", m: "", d: "" };
}

type Parts = { y: string; m: string; d: string };

/** 년/월/일이 다 채워졌는지 (자릿수만 본다 - 유효성은 별도로 확인). */
function isComplete(p: Parts): boolean {
  return p.y.length === 4 && p.m.length > 0 && p.d.length > 0;
}

/** "2026-13-01"(13월), "2026-02-30"(2월 30일) 같은 값은 서버에서 Invalid Date로 500이 났었다. */
function isValid(p: Parts): boolean {
  return isComplete(p) && isValidYmdParts(Number(p.y), Number(p.m), Number(p.d));
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
  // 우리가 마지막으로 emit한 값을 기억해둔다 - value prop이 바뀌었을 때, 그게 우리 자신의
  // onChange가 왕복해 돌아온 것인지(그럼 화면을 건드리면 안 됨 - 타이핑 중 지워짐) 아니면
  // 부모가 직접 바꾼 것인지(예: 출장기간 시작일을 넣으면 종료일도 자동으로 채우는 기능,
  // 2026-08-10) 구분하는 용도.
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value !== lastEmitted.current) {
      setParts(parse(value));
      lastEmitted.current = value;
    }
  }, [value]);

  function set(part: "y" | "m" | "d", raw: string, maxLen: number) {
    const digits = raw.replace(/\D/g, "").slice(0, maxLen);
    const next = { ...parts, [part]: digits };
    setParts(next);
    // 달력에 없는 날짜(13월, 2월 30일 등)는 값을 비워 상위 폼이 제출을 막게 한다.
    const emitted = isValid(next) ? `${next.y}-${next.m.padStart(2, "0")}-${next.d.padStart(2, "0")}` : "";
    lastEmitted.current = emitted;
    onChange(emitted);
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
      const emitted = `${parsed.y}-${parsed.m}-${parsed.d}`;
      lastEmitted.current = emitted;
      onChange(emitted);
    }
  }

  const invalid = isComplete(parts) && !isValid(parts);
  const inputClass = `rounded-lg bg-transparent px-1 py-2 text-center text-[14px] outline-none ${
    invalid ? "text-red-500" : "text-neutral-900 dark:text-neutral-100"
  }`;

  return (
    <div className="shrink-0">
      <div className="flex flex-nowrap items-center gap-0.5">
        <input
          type="text"
          inputMode="numeric"
          placeholder="YYYY"
          value={parts.y}
          onChange={(e) => set("y", e.target.value, 4)}
          className={`w-12 shrink-0 ${inputClass}`}
        />
        <span className="shrink-0 text-neutral-400">.</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="MM"
          value={parts.m}
          onChange={(e) => set("m", e.target.value, 2)}
          className={`w-8 shrink-0 ${inputClass}`}
        />
        <span className="shrink-0 text-neutral-400">.</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="DD"
          value={parts.d}
          onChange={(e) => set("d", e.target.value, 2)}
          className={`w-8 shrink-0 ${inputClass}`}
        />
        <span className="shrink-0 text-neutral-400">.</span>

        <button
          type="button"
          onClick={openPicker}
          aria-label="달력에서 날짜 선택"
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-brand/10 hover:text-brand dark:hover:bg-white/10 dark:hover:text-brand-light"
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
      {invalid && (
        <p className="mt-1 text-[12px] text-red-500">날짜를 확인해 주세요 (없는 날짜입니다).</p>
      )}
    </div>
  );
}
