"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { IconMail } from "./icons";
import { assembleTripPdf } from "@/lib/pdfAssembleClient";
import { getRememberedEmail, setRememberedEmail } from "@/lib/localSettings";
import { summarizeByCategory } from "@/lib/tripSummaryLocal";
import type { LocalTrip, LocalReceipt } from "@/lib/localDb";
import { useLocale, useT } from "@/lib/i18n/LanguageProvider";
import { buildSentMessage, buildEmailSubject, buildSimpleModeBodyLines, buildDetailedModeBodyLines } from "@/lib/i18n/messages/emailBody";

/**
 * 예전엔 서버가 트립/영수증을 Prisma에서 직접 읽어 제목·본문·PDF를 전부 만들었지만, 이제 그
 * 데이터는 로컬(IndexedDB)에만 있다 - 그래서 PDF 조립(assembleTripPdf)뿐 아니라 제목/본문 계산도
 * 여기서 한다. 서버(/api/send-settlement)는 완성된 PDF(임시 Blob 경유)와 제목/본문 텍스트를
 * 받아 SMTP로 보내기만 하는 상태 없는 중계로 남는다.
 */
export default function EmailSendButton({
  tripId,
  trip,
  receipts,
  enabled,
}: {
  tripId: string;
  trip: LocalTrip;
  receipts: LocalReceipt[];
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const t = useT();
  const { locale } = useLocale();

  useEffect(() => {
    getRememberedEmail().then((remembered) => {
      if (remembered) setEmail(remembered);
    });
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      const pdfBlob = await assembleTripPdf(tripId, locale);
      const uploaded = await upload(`outbound/${tripId}.pdf`, pdfBlob, {
        access: "private",
        handleUploadUrl: "/api/send-settlement/token",
        contentType: "application/pdf",
      });

      const { byCategory, sumByCategory, totalAmount } = summarizeByCategory(receipts);
      const isSimple = trip.settlementMode === "SIMPLE";
      const subject = buildEmailSubject(locale, trip);

      // PDF와 완전히 같은 데이터(sumByCategory - 규정 검토를 거친 확인금액 합계)와 표시 규칙을
      // 써서, 첨부 PDF와 메일 본문 숫자가 어긋나지 않게 한다(2026-08-11 원본 로직 그대로 유지,
      // locale만 messages/emailBody.ts의 빌더 함수로 추가).
      const bodyLines = isSimple
        ? buildSimpleModeBodyLines(locale, { byCategory, sumByCategory })
        : buildDetailedModeBodyLines(locale, trip, { byCategory, sumByCategory, transportItems: byCategory.TRANSPORT }, totalAmount);

      const res = await fetch("/api/send-settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          blobUrl: uploaded.url,
          subject,
          text: bodyLines.join("\n"),
          filename: `trip-${tripId}-settlement.pdf`,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, message: buildSentMessage(locale, email) });
        await setRememberedEmail(email);
      } else {
        // 서버(/api/send-settlement)의 에러 문자열은 아직 한국어 전용이다(2026-08-11 영어 버전
        // 작업 범위 밖으로 결정 - 우선순위 낮음). 영어 모드에서는 원문 대신 일반 실패 메시지를
        // 보여줘서 화면에 한국어 원문이 섞여 노출되는 걸 막는다.
        setResult({ ok: false, message: locale === "ko" && data.error ? data.error : t.emailSendButton.errSendFailed });
      }
    } catch (err) {
      console.error("정산서 발송 실패:", err);
      setResult({ ok: false, message: t.emailSendButton.errSendError });
    } finally {
      setSending(false);
    }
  }

  if (!enabled) {
    return (
      <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-2xl bg-white/10 px-4 py-2.5 text-[12.5px] text-blue-100">
        <IconMail className="size-4 shrink-0" />
        {t.emailSendButton.comingSoon}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-[14px] font-semibold text-white backdrop-blur transition hover:bg-white/25"
      >
        <IconMail className="size-5" />
        {t.emailSendButton.receiveByEmail}
      </button>
    );
  }

  return (
    <div className="min-w-[220px] flex-1">
      <form onSubmit={handleSend} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.emailSendButton.emailPlaceholder}
          className="min-w-0 flex-1 rounded-full bg-white/15 px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-blue-100"
        />
        <button
          type="submit"
          disabled={sending}
          className="shrink-0 rounded-full bg-white px-4 py-2.5 text-[14px] font-semibold text-brand disabled:opacity-50"
        >
          {sending ? t.emailSendButton.sending : t.emailSendButton.send}
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
