"use client";

import { useState } from "react";
import { assembleTripPdf } from "@/lib/pdfAssembleClient";
import { IconDownload } from "./icons";
import { useLocale, useT } from "@/lib/i18n/LanguageProvider";

/**
 * 예전엔 /api/trips/[id]/pdf에 그냥 <a href download>로 링크만 걸면 됐지만, 이제 PDF를
 * 브라우저에서 직접 조립하므로(로컬 사진+한글 폰트 fetch+pdf-lib) 클릭 시점에 비동기로
 * 만들어 Blob URL을 임시로 만들고 그걸로 다운로드를 트리거해야 한다.
 */
export default function PdfDownloadButton({ tripId, label }: { tripId: string; label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const { locale } = useLocale();

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const blob = await assembleTripPdf(tripId, locale);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trip-${tripId}-settlement.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF 생성 실패:", err);
      setError(t.pdfDownloadButton.errGenerate);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2.5 text-[14px] font-semibold text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-50"
      >
        <IconDownload className="size-5" />
        {loading ? t.pdfDownloadButton.generating : label}
      </button>
      {error && <p className="mt-2 text-[13px] text-red-100">{error}</p>}
    </div>
  );
}
