"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function IdentitySwitcher({ email }: { email: string }) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);

  async function handleSwitch() {
    setSwitching(true);
    await fetch("/api/identity", { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between rounded-2xl bg-black/5 px-3 py-2 text-[12.5px] text-neutral-500 dark:bg-white/5 dark:text-neutral-400">
      <span className="truncate">{email}님으로 보는 중</span>
      <button
        type="button"
        onClick={handleSwitch}
        disabled={switching}
        className="shrink-0 font-medium text-blue-600 disabled:opacity-50 dark:text-blue-400"
      >
        다른 사람으로 전환
      </button>
    </div>
  );
}