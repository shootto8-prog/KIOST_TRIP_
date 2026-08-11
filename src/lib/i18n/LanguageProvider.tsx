"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_LOCALE, LANG_STORAGE_KEY, type Locale } from "./locale";
import ko from "./dictionaries/ko";
import en from "./dictionaries/en";

const dictionaries = { ko, en };

type LanguageContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * 다크모드처럼 인라인 스크립트+CSS만으로는 처리할 수 없다 - 언어는 실제 텍스트 내용을 바꾸므로
 * React state가 필요하다. 항상 DEFAULT_LOCALE("ko")로 첫 렌더를 시작해 서버 렌더와 동일하게
 * 맞추고(hydration mismatch 방지), 마운트 후 저장된 값이 "en"이면 그때 전환한다 - 저장된
 * 선호가 영어인 사용자는 첫 페인트 후 한 번 전환되는 깜빡임을 감수한다(이 앱은 이미
 * LocalDataBoundary 로딩 화면 뒤에 실제 콘텐츠가 숨어 있어 기존 UX와 같은 수준의 트레이드오프).
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (stored === "en") setLocaleState("en");
    } catch {
      // localStorage 접근 불가(사생활 보호 모드 등) - 기본 언어(한국어)로 계속 진행
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // 저장 실패해도 이번 세션 동안은 상태가 유지되므로 무시
    }
    document.documentElement.lang = next;
  }, []);

  return <LanguageContext.Provider value={{ locale, setLocale }}>{children}</LanguageContext.Provider>;
}

export function useLocale(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLocale must be used within LanguageProvider");
  return ctx;
}

/** 현재 언어에 맞는 번역 사전을 돌려준다 - 컴포넌트에서 `const t = useT()`로 바로 쓴다. */
export function useT() {
  const { locale } = useLocale();
  return dictionaries[locale];
}
