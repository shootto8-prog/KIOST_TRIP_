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
        </div>
      </body>
    </html>
  );
}
