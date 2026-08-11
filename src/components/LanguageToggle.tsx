"use client";

import { useLocale, useT } from "@/lib/i18n/LanguageProvider";

/**
 * ThemeToggle과 같은 버튼 셸을 쓰지만, 다크모드처럼 순수 CSS(dark: 변형)로는 처리할 수 없다 -
 * 언어는 실제 텍스트 내용이라 아이콘도 React state에 따라 조건부 렌더링해야 한다
 * (LanguageProvider의 마운트-후-전환 트레이드오프와 동일선상, 새로운 위험 아님).
 */
export default function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const next = locale === "ko" ? "en" : "ko";

  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={locale === "ko" ? t.languageToggle.toEn : t.languageToggle.toKo}
      title={locale === "ko" ? t.languageToggle.toEn : t.languageToggle.toKo}
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/5 text-[18px] leading-none transition active:scale-95 dark:bg-white/5"
    >
      {locale === "ko" ? "🇺🇸" : "🇰🇷"}
    </button>
  );
}
