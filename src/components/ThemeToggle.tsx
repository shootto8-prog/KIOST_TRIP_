"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

/**
 * layout.tsx의 인라인 스크립트가 최초 페인트 전에 <html>에 .dark 클래스를 이미 붙여둔다 -
 * 여기서는 그 결과를 그대로 읽어와서 아이콘/토글 상태를 맞추기만 하면 된다(서버에서는 다크
 * 여부를 알 수 없어 클라이언트 마운트 후에 한 번 동기화한다).
 */
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/5 text-neutral-500 transition active:scale-95 dark:bg-white/5 dark:text-neutral-400"
    >
      {dark ? <IconSun className="size-[18px]" /> : <IconMoon className="size-[18px]" />}
    </button>
  );
}
