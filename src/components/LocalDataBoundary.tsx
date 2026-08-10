"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/** IndexedDB에서 데이터를 읽어오는 6개 화면(홈, 출장 허브, 카테고리 4개)이 공통으로 쓰는
 * 로딩/미존재 상태 처리 - Server Component 시절의 notFound()를 클라이언트에서는 쓸 수 없어
 * 대신 안내 화면으로 대체한다. */
export default function LocalDataBoundary({
  loading,
  notFound,
  children,
}: {
  loading: boolean;
  notFound: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return <main className="py-20 text-center text-[14px] text-neutral-400">불러오는 중...</main>;
  }
  if (notFound) {
    return (
      <main className="space-y-4 py-20 text-center">
        <p className="text-[14px] text-neutral-400">출장을 찾을 수 없습니다.</p>
        <Link href="/" className="text-[14px] font-medium text-brand dark:text-brand-light">
          홈으로
        </Link>
      </main>
    );
  }
  return <>{children}</>;
}
