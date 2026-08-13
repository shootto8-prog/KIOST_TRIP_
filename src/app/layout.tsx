import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n/LanguageProvider";
import LayoutFooter from "@/components/LayoutFooter";

export const metadata: Metadata = {
  title: "출장복명 간편서비스",
  description: "출장 실비(조식/교통/숙박/현장사진) 정산 도우미",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 화면이 그려지기 전에 저장된 테마(없으면 OS 설정)를 <html>에 반영해, 다크모드
            사용자에게 밝은 화면이 잠깐 번쩍이는 걸 막는다. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.toggle('dark',t==='dark');}catch(e){}})();",
          }}
        />
        {/* lang 속성은 텍스트가 아니라 속성이라, suppressHydrationWarning 덕에 테마와 똑같이
            페인트 전에 안전하게 반영할 수 있다(실제 화면 텍스트는 LanguageProvider가 마운트
            후에 전환 - lang 속성만 이 스크립트로 미리 맞춰둔다). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{if(localStorage.getItem('lang')==='en'){document.documentElement.lang='en';}}catch(e){}})();",
          }}
        />
      </head>
      <body className="min-h-screen">
        <LanguageProvider>
          <div className="watermark-logo" aria-hidden="true" />
          <div className="relative z-10 mx-auto max-w-2xl px-4 pb-24 pt-8 sm:px-6">
            {children}
            <footer className="mt-10 border-t border-black/5 pt-4 text-center text-sm leading-relaxed text-neutral-400 dark:border-white/10 dark:text-neutral-500">
              <LayoutFooter />
            </footer>
          </div>
        </LanguageProvider>
      </body>
    </html>
  );
}
