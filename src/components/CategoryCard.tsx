"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useLocale } from "@/lib/i18n/LanguageProvider";
import { buildCategorySummary } from "@/lib/i18n/messages/categorySummary";

export default function CategoryCard({
  href,
  icon,
  label,
  count,
  amount,
  autoSettlement = true,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  count: number;
  amount: number;
  /** false면 금액이 항상 0(판정을 안 하므로)이라, "0원"처럼 오해할 수 있는 표시 대신 건수만 보여준다. */
  autoSettlement?: boolean;
}) {
  const { locale } = useLocale();
  const summaryText = buildCategorySummary(locale, count, amount, autoSettlement);
  return (
    <Link
      href={href}
      className="shadow-soft flex aspect-square flex-col items-center justify-center gap-2 rounded-[28px] border border-black/5 bg-white/80 p-4 text-center transition active:scale-[0.97] dark:border-white/10 dark:bg-white/[0.04]"
    >
      {icon}
      <span className="text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
        {label}
      </span>
      <span className="text-[12px] text-neutral-400">{summaryText}</span>
    </Link>
  );
}
