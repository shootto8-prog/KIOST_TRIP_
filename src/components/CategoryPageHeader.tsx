import Link from "next/link";
import type { ReactNode } from "react";
import { IconChevronLeft } from "./icons";

export default function CategoryPageHeader({
  tripId,
  icon,
  title,
  accent,
}: {
  tripId: string;
  icon: ReactNode;
  title: string;
  accent: string;
}) {
  return (
    <header className="flex items-center gap-3">
      <Link
        href={`/trip/${tripId}`}
        aria-label="출장으로 돌아가기"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-neutral-600 transition hover:bg-brand/10 hover:text-brand dark:bg-white/10 dark:text-neutral-300"
      >
        <IconChevronLeft />
      </Link>
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-black/5 dark:ring-white/10 ${accent}`}
      >
        {icon}
      </span>
      <h1 className="text-[22px] font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
        {title}
      </h1>
    </header>
  );
}
