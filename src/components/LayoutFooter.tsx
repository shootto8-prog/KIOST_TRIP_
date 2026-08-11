"use client";

import { IconPhone, IconMail } from "@/components/icons";
import { useT } from "@/lib/i18n/LanguageProvider";

/** 루트 레이아웃(Server Component)은 useT()를 직접 못 쓰므로, 푸터만 클라이언트 컴포넌트로 뗐다. */
export default function LayoutFooter() {
  const t = useT();
  return (
    <>
      <p>{t.layout.footerTitle}</p>
      <p className="flex items-center justify-center gap-1.5">
        <span>{t.layout.contactLabel}</span>
        <a
          href="tel:051-664-9090"
          aria-label={t.layout.phoneAria}
          title="051-664-9090"
          className="inline-flex items-center justify-center rounded-full p-1 text-neutral-400 hover:text-brand dark:text-neutral-500 dark:hover:text-brand-light"
        >
          <IconPhone className="size-3.5" />
        </a>
        <a
          href="mailto:young@kiost.ac.kr"
          aria-label={t.layout.emailAria}
          title="young@kiost.ac.kr"
          className="inline-flex items-center justify-center rounded-full p-1 text-neutral-400 hover:text-brand dark:text-neutral-500 dark:hover:text-brand-light"
        >
          <IconMail className="size-3.5" />
        </a>
      </p>
      <p>{t.layout.disclaimer}</p>
    </>
  );
}
