"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";
import { IconMail } from "./icons";
import { assembleTripPdf } from "@/lib/pdfAssembleClient";
import { getRememberedEmail, setRememberedEmail } from "@/lib/localSettings";
import { summarizeByCategory } from "@/lib/tripSummaryLocal";
import { buildTransportCell, countAndAmount } from "@/lib/settlementFormat";
import { CATEGORY_LABEL, formatDate } from "@/lib/format";
import type { LocalTrip, LocalReceipt } from "@/lib/localDb";

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
      const pdfBlob = await assembleTripPdf(tripId);
      const uploaded = await upload(`outbound/${tripId}.pdf`, pdfBlob, {
        access: "private",
        handleUploadUrl: "/api/send-settlement/token",
        contentType: "application/pdf",
      });

      const { byCategory, sumByCategory, totalAmount } = summarizeByCategory(receipts);
      // PDF의 "항목별 합계" 표와 같은 표시 규칙(countAndAmount/buildTransportCell)을 그대로 써서,
      // 첨부 PDF와 메일 본문에 서로 다른 값이 찍히는 걸 막는다.
      const subject = `[정총무]국내여비 증빙서류 내역서 (${formatDate(trip.startDate)} ~ ${formatDate(trip.endDate)})`;
      const bodyLines = [
        trip.autoSettlement
          ? "출장 실비정산 내역을 첨부드립니다."
          : "자동정산을 사용하지 않은 출장입니다. 제출된 증빙 서류를 첨부드리니 확인 후 정산 금액을 확정해 주세요.",
        "",
        trip.autoSettlement
          ? `${CATEGORY_LABEL.BREAKFAST}   ${byCategory.BREAKFAST.length}건   ${sumByCategory.BREAKFAST.toLocaleString("ko-KR")}원`
          : `${CATEGORY_LABEL.BREAKFAST}   ${countAndAmount(byCategory.BREAKFAST.length, sumByCategory.BREAKFAST)}`,
        `${CATEGORY_LABEL.TRANSPORT}   ${buildTransportCell(byCategory.TRANSPORT, trip.autoSettlement)}`,
        trip.autoSettlement
          ? `${CATEGORY_LABEL.LODGING}   ${byCategory.LODGING.length}건   ${sumByCategory.LODGING.toLocaleString("ko-KR")}원`
          : `${CATEGORY_LABEL.LODGING}   ${countAndAmount(byCategory.LODGING.length, sumByCategory.LODGING)}`,
        `현장사진   ${byCategory.FIELD.length}건`,
        ...(trip.autoSettlement ? [`합계   ${totalAmount.toLocaleString("ko-KR")}원`] : []),
      ];

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
        setResult({ ok: true, message: `${email}로 보냈습니다.` });
        await setRememberedEmail(email);
      } else {
        setResult({ ok: false, message: data.error ?? "발송에 실패했습니다." });
      }
    } catch (err) {
      console.error("정산서 발송 실패:", err);
      setResult({ ok: false, message: "발송 중 오류가 발생했습니다." });
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
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-[14px] font-semibold text-white backdrop-blur transition hover:bg-white/25"
      >
        <IconMail className="size-5" />
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
          placeholder="받으실 이메일 주소 (@kiost.ac.kr)"
          className="min-w-0 flex-1 rounded-full bg-white/15 px-4 py-2.5 text-[14px] text-white outline-none placeholder:text-blue-100"
        />
        <button
          type="submit"
          disabled={sending}
          className="shrink-0 rounded-full bg-white px-4 py-2.5 text-[14px] font-semibold text-brand disabled:opacity-50"
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
