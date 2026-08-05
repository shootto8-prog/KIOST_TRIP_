import Link from "next/link";
import type { ReactNode } from "react";

export default function CategoryCard({
  href,
  icon,
  label,
  count,
  amount,
  accent,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  count: number;
  amount: number;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="shadow-soft flex aspect-square flex-col items-center justify-center gap-2 rounded-[28px] border border-black/5 bg-white/80 p-4 text-center transition active:scale-[0.97] dark:border-white/10 dark:bg-white/[0.04]"
    >
      <span
        className={`flex size-14 items-center justify-center rounded-full ring-1 ring-inset ring-black/5 dark:ring-white/10 ${accent}`}
      >
        {icon}
      </span>
      <span className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
        {label}
      </span>
      <span className="text-[12px] text-neutral-400">
        {count > 0 ? `${count}건 · ${amount.toLocaleString("ko-KR")}원` : "등록된 영수증 없음"}
      </span>
    </Link>
  );
}
