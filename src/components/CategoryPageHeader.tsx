"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronLeft } from "./icons";
import { useT } from "@/lib/i18n/LanguageProvider";

export default function CategoryPageHeader({
  tripId,
  icon,
  title,
}: {
  tripId: string;
  icon: ReactNode;
  title: string;
}) {
  const t = useT();
  return (
    <header className="flex items-center gap-3">
      <Link
        href={`/trip/${tripId}`}
        aria-label={t.categoryPageHeader.backAria}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-neutral-600 transition hover:bg-brand/10 hover:text-brand dark:bg-white/10 dark:text-neutral-300"
      >
        <IconChevronLeft />
      </Link>
      {icon}
      <h1 className="text-[22px] font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
        {title}
      </h1>
    </header>
  );
}
