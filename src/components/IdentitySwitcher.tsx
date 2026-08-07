"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconPerson } from "./icons";

export default function IdentitySwitcher({ email }: { email: string }) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function handleSwitch() {
    setSwitching(true);
    await fetch("/api/identity", { method: "DELETE" });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      disabled={switching}
      aria-label={`${email}님으로 보는 중 · 탭하면 다른 사람으로 전환`}
      title={`${email}님으로 보는 중 · 탭하면 다른 사람으로 전환`}
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/5 text-neutral-500 transition active:scale-95 disabled:opacity-50 dark:bg-white/5 dark:text-neutral-400"
    >
      <IconPerson className="size-[18px]" />
    </button>
  );
}
