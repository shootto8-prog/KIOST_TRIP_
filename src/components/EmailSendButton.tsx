"use client";

import { useState } from "react";
import { IconMail } from "./icons";

export default function EmailSendButton({
  tripId,
  enabled,
  defaultEmail,
}: {
  tripId: string;
  enabled: boolean;
  defaultEmail?: string;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: `${email}로 보냈습니다.` });
        setEmail("");
      } else {
        setResult({ ok: false, message: data.error ?? "발송에 실패했습니다." });
      }
    } catch {
      setResult({ ok: false, message: "네트워크 오류가 발생했습니다." });
    } finally {
      setSending(false);
    }
  }

  if (!enabled) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-[12.5px] text-blue-100">
        <IconMail className="size-4 shrink-0" />
        이메일 발송 기능은 준비 중입니다 (회사 SMTP 계정 연동 후 제공 예정)
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-2.5 text-[14px] font-semibold text-white backdrop-blur transition hover:bg-white/25"
      >
        <IconMail className="size-4" />
        이메일로 받기
      </button>
    );
  }

  return (
    <div className="mt-2">
      <form onSubmit={handleSend} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="받으실 이메일 주소"
          className="min-w-0 flex-1 rounded-2xl bg-white/15 px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-blue-100"
        />
        <button
          type="submit"
          disabled={sending}
          className="shrink-0 rounded-2xl bg-white px-4 py-2.5 text-[14px] font-semibold text-blue-600 disabled:opacity-50"
        >
          {sending ? "발송 중..." : "보내기"}
        </button>
      </form>
      {result && (
        <p className={`mt-2 text-[13px] ${result.ok ? "text-blue-100" : "text-red-100"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
