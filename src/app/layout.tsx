import type { Metadata } from "next";
import "./globals.css";
import { IconPhone, IconMail } from "@/components/icons";

export const metadata: Metadata = {
  title: "정총무1.0(KIOST 국내여비 간편서비스)",
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
      </head>
      <body className="min-h-screen">
        <div className="watermark-logo" aria-hidden="true" />
        <div className="relative z-10 mx-auto max-w-2xl px-4 pb-24 pt-8 sm:px-6">
          {children}
          <footer className="mt-10 border-t border-black/5 pt-4 text-center text-sm leading-relaxed text-neutral-400 dark:border-white/10 dark:text-neutral-500">
            <p>정총무 1.0 (KIOST 국내여비 간편서비스) 2026</p>
            <p className="flex items-center justify-center gap-1.5">
              <span>문의 : KIOST 총무복지실</span>
              <a
                href="tel:051-664-9090"
                aria-label="전화 문의 051-664-9090"
                title="051-664-9090"
                className="inline-flex items-center justify-center rounded-full p-1 text-neutral-400 hover:text-brand dark:text-neutral-500 dark:hover:text-brand-light"
              >
                <IconPhone className="size-3.5" />
              </a>
              <a
                href="mailto:young@kiost.ac.kr"
                aria-label="이메일 문의 young@kiost.ac.kr"
                title="young@kiost.ac.kr"
                className="inline-flex items-center justify-center rounded-full p-1 text-neutral-400 hover:text-brand dark:text-neutral-500 dark:hover:text-brand-light"
              >
                <IconMail className="size-3.5" />
              </a>
            </p>
            <p>해당 시스템은 참고용이며, 담당부서 검토시 수정,반려될 수 있습니다</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
