"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 로그인이 아니라, 홈 화면에 "본인 출장만" 골라 보여주기 위한 최초 1회 식별 절차다.
 * 여기서 받은 이메일이 새 출장 등록 시 ownerEmail로 자동 연결된다.
 */
export default function IdentityPrompt() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        setSubmitting(false);
        return;
      }
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="shadow-glow rounded-[28px] border border-brand/10 bg-white/90 p-5 backdrop-blur dark:border-white/10 dark:bg-white/[0.04] sm:p-6"
    >
      <h2 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
        본인 확인
      </h2>
      <p className="mt-1 text-[12.5px] text-neutral-500">
        로그인이 아니라, 본인의 출장만 구분해서 보여드리기 위한 이메일 입력이에요. 한 번만 입력하시면
        이 기기에서는 계속 기억됩니다.
      </p>
      <input
        type="email"
        required
        placeholder="you@kiost.ac.kr"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-4 w-full rounded-xl bg-neutral-50 px-3 py-2.5 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400 dark:bg-white/10 dark:text-neutral-100"
      />
      {error && <p className="mt-2 text-[13px] text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="shadow-glow mt-4 w-full rounded-full bg-brand py-3 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
      >
        {submitting ? "확인 중..." : "시작하기"}
      </button>
    </form>
  );
}
