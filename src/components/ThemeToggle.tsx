"use client";

import { IconMoon, IconSun } from "./icons";
import { useT } from "@/lib/i18n/LanguageProvider";

/**
 * layout.tsx의 인라인 스크립트가 최초 페인트 전에 <html>에 .dark 클래스를 이미 붙여둔다.
 * 아이콘 전환을 React state(useState+useEffect)가 아니라 Tailwind의 dark: 변형(순수 CSS)으로
 * 처리한다 - 서버가 보낸 HTML과 클라이언트 렌더 결과가 항상 동일해 hydration 불일치가 없고,
 * 마운트 전까지 아이콘이 잠깐 반대로 보이는 깜빡임도 없다. (2026-08-07 안정성 재검토 반영)
 */
export default function ThemeToggle() {
  const t = useT();

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t.themeToggle.label}
      title={t.themeToggle.label}
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/5 text-neutral-500 transition active:scale-95 dark:bg-white/5 dark:text-neutral-400"
    >
      <IconMoon className="size-[18px] dark:hidden" />
      <IconSun className="hidden size-[18px] dark:block" />
    </button>
  );
}
