import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "정총무1.0(KIOST 국내여비 간편서비스)",
  description: "출장 실비(조식/교통/숙박/현장사진) 정산 도우미",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <div className="mx-auto max-w-2xl px-4 pb-24 pt-8 sm:px-6">
          {children}
          <footer className="mt-10 border-t border-black/5 pt-4 text-center text-sm leading-relaxed text-neutral-400 dark:border-white/10 dark:text-neutral-500">
            <p>정총무 1.0 (KIOST 국내여비 간편서비스) 2026</p>
            <p>문의사항 : 총무복지실(051-664-9090)</p>
            <p>해당 시스템은 참고용이며, 담당부서 검토시 수정,반려될 수 있습니다</p>
          </footer>
        </div>
      </body>
    </html>
  );
}