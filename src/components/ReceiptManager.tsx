"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCamera, IconPhoto, IconTrash, IconPdf, IconPlus } from "./icons";
import type { ReceiptItem } from "@/lib/receipt";
import { VERDICT_LABEL } from "@/lib/format";
import { FLAT_RATE_TRANSPORT_MODES } from "@/lib/verifyReceipt";

export type { ReceiptItem };

type TransportMode = "SHIP" | "AIR" | "RAIL" | "PRIVATE_CAR" | "BUS";
type Category = "BREAKFAST" | "TRANSPORT" | "LODGING" | "FIELD";

function isFlatRate(mode?: TransportMode): boolean {
  return !!mode && (FLAT_RATE_TRANSPORT_MODES as readonly string[]).includes(mode);
}

function formatOcrDate(iso: string | null): string {
  if (!iso) return "인식 안 됨";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "인식 안 됨";
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatOcrAmount(amount: number | null): string {
  return amount === null ? "인식 안 됨" : `${amount.toLocaleString("ko-KR")}원`;
}

const VERDICT_BADGE_CLASS: Record<ReceiptItem["verdictStatus"], string> = {
  APPROVED: "bg-emerald-500/90 text-white",
  PARTIAL: "bg-amber-500/90 text-white",
  REJECTED: "bg-red-500/90 text-white",
  PENDING: "bg-neutral-400/90 text-white",
};

function VerdictBanner({
  receipt,
  onReanalyze,
  reanalyzing,
}: {
  receipt: ReceiptItem;
  onReanalyze: (id: string) => void;
  reanalyzing: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 text-[13px] ${
        receipt.verdictStatus === "APPROVED"
          ? "bg-emerald-500/10"
          : receipt.verdictStatus === "PARTIAL"
          ? "bg-amber-500/10"
          : receipt.verdictStatus === "REJECTED"
          ? "bg-red-500/10"
          : "bg-neutral-500/10"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${VERDICT_BADGE_CLASS[receipt.verdictStatus]}`}
        >
          {VERDICT_LABEL[receipt.verdictStatus]}
        </span>
        {receipt.verdictAmount !== null && (
          <span className="text-[15px] font-bold text-neutral-900 dark:text-neutral-100">
            {receipt.verdictAmount.toLocaleString("ko-KR")}원 인정
          </span>
        )}
      </div>
      {receipt.verdictMessage && (
        <p className="mt-2 text-neutral-700 dark:text-neutral-300">{receipt.verdictMessage}</p>
      )}
      {receipt.verdictRegulationRef && (
        <p className="mt-2 text-[11px] text-neutral-400">근거: {receipt.verdictRegulationRef}</p>
      )}
      {receipt.verdictFailedCheck === "ocr_unavailable" && (
        <button
          type="button"
          onClick={() => onReanalyze(receipt.id)}
          disabled={reanalyzing}
          className="mt-3 w-full rounded-xl bg-neutral-900 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {reanalyzing ? "다시 인식 중..." : "다시 인식 시도"}
        </button>
      )}
    </div>
  );
}

function ImageGallery({ receipt }: { receipt: ReceiptItem }) {
  if (receipt.images.length <= 1) return null;
  return (
    <div className="flex gap-2 overflow-x-auto">
      {receipt.images.map((img) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={img.id}
          src={img.path}
          alt="첨부 사진"
          className="h-20 w-20 shrink-0 rounded-xl object-cover"
        />
      ))}
    </div>
  );
}

function OcrDetailCard({
  receipt,
  onReanalyze,
  reanalyzing,
}: {
  receipt: ReceiptItem;
  onReanalyze: (id: string) => void;
  reanalyzing: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const ocrSkipped = receipt.ocrStatus === "PENDING";
  return (
    <div className="space-y-3">
      <VerdictBanner receipt={receipt} onReanalyze={onReanalyze} reanalyzing={reanalyzing} />
      <ImageGallery receipt={receipt} />
      {!ocrSkipped && (
        <div className="rounded-2xl border border-black/5 bg-neutral-50 p-4 text-[13px] dark:border-white/10 dark:bg-white/5">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">
            인식 결과{" "}
            {receipt.ocrStatus === "FAILED" && <span className="text-red-500">(인식 실패)</span>}
          </p>
          <dl className="space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-neutral-400">상호명</dt>
              <dd className="text-right text-neutral-800 dark:text-neutral-200">
                {receipt.ocrMerchantGuess ?? "인식 안 됨"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-neutral-400">일시</dt>
              <dd className="text-right text-neutral-800 dark:text-neutral-200">
                {formatOcrDate(receipt.ocrDateGuess)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 text-neutral-400">
                {receipt.category === "TRANSPORT" && receipt.images.length > 1 ? "인식 합계금액" : "금액"}
              </dt>
              <dd className="text-right font-semibold text-neutral-900 dark:text-neutral-100">
                {formatOcrAmount(receipt.ocrAmountGuess)}
              </dd>
            </div>
          </dl>
          {receipt.ocrText && (
            <>
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="mt-3 text-[12px] font-medium text-blue-600 dark:text-blue-400"
              >
                {showRaw ? "원문 텍스트 숨기기" : "원문 텍스트 전체 보기"}
              </button>
              {showRaw && (
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-black/5 p-3 text-[12px] leading-relaxed text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
                  {receipt.ocrText}
                </pre>
              )}
            </>
          )}
          {!receipt.ocrText && receipt.ocrStatus === "FAILED" && (
            <p className="mt-3 text-[12px] text-neutral-400">
              텍스트 인식에 실패했습니다. 사진이 흐리거나 모델 호출에 문제가 있을 수 있습니다.
            </p>
          )}
          {receipt.ocrModel && (
            <p className="mt-3 text-[11px] text-neutral-400">{receipt.ocrModel}로 인식됨</p>
          )}
        </div>
      )}
    </div>
  );
}

type QueuedFile = { id: string; file: File; url: string };

export default function ReceiptManager({
  tripId,
  category,
  transportMode,
  initialReceipts,
}: {
  tripId: string;
  category: Category;
  transportMode?: TransportMode;
  initialReceipts: ReceiptItem[];
}) {
  const router = useRouter();
  const [receipts, setReceipts] = useState<ReceiptItem[]>(initialReceipts);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const flatRate = isFlatRate(transportMode);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setQueue((prev) => [
      ...prev,
      ...Array.from(files).map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
  }

  function onGalleryPicked(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    e.target.value = "";
  }

  function onCameraPicked(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    e.target.value = "";
  }

  function removeQueued(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }

  function clearQueue() {
    setQueue([]);
    setError(null);
  }

  async function confirmUpload() {
    if (queue.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("tripId", tripId);
      form.append("category", category);
      if (transportMode) form.append("transportMode", transportMode);
      for (const q of queue) form.append("files", q.file);
      const res = await fetch("/api/receipts", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "업로드에 실패했습니다.");
        setUploading(false);
        return;
      }
      setReceipts((prev) => [data.receipt, ...prev]);
      setSelectedId(data.receipt.id);
      setQueue([]);
      setUploading(false);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setUploading(false);
    }
  }

  async function reanalyzeReceipt(id: string) {
    setReanalyzingId(id);
    try {
      const res = await fetch(`/api/receipts/${id}/reanalyze`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setReceipts((prev) => prev.map((r) => (r.id === id ? data.receipt : r)));
        router.refresh();
      }
    } catch {
      // 재시도 실패는 조용히 무시 - 배너의 버튼이 그대로 남아 다시 누를 수 있다.
    } finally {
      setReanalyzingId(null);
    }
  }

  async function removeReceipt(id: string) {
    setReceipts((prev) => prev.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
    await fetch(`/api/receipts?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  const selectedReceipt = receipts.find((r) => r.id === selectedId) ?? null;

  const hint =
    category === "FIELD"
      ? "판정 대상이 아닌 증빙용 사진입니다. 첨부하면 바로 인정 처리됩니다."
      : flatRate
      ? "정액정산 대상으로 금액 확인 없이 사진만 첨부하면 바로 인정됩니다."
      : category === "TRANSPORT"
      ? "왕복 등 결제가 여러 건이면 사진을 각각 추가해 주세요 - 사진별로 인식한 금액을 자동으로 합산합니다."
      : "여러 장이면 같은 영수증의 다음 페이지로 보고 합쳐서 인식합니다.";

  return (
    <div className="space-y-4">
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={onGalleryPicked}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onCameraPicked}
      />

      {queue.length === 0 ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-black/5 bg-white/80 py-4 text-[15px] font-medium text-neutral-700 shadow-sm active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-200"
          >
            <IconPhoto />
            사진 선택(갤러리)
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-[15px] font-semibold text-white shadow-sm active:scale-[0.98]"
          >
            <IconCamera />
            카메라로 촬영
          </button>
        </div>
      ) : (
        <div className="rounded-3xl border border-black/5 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex flex-wrap gap-2">
            {queue.map((q) => (
              <div key={q.id} className="relative size-20 overflow-hidden rounded-xl bg-neutral-100 dark:bg-white/5">
                {q.file.type === "application/pdf" ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1">
                    <IconPdf className="size-6 text-neutral-400" />
                    <span className="max-w-full truncate text-[9px] text-neutral-500">{q.file.name}</span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.url} alt="선택한 사진" className="h-full w-full object-cover" />
                )}
                <button
                  type="button"
                  onClick={() => removeQueued(q.id)}
                  aria-label="사진 제거"
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
                >
                  <IconTrash className="size-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              aria-label="사진 추가(갤러리)"
              className="flex size-20 items-center justify-center rounded-xl border border-dashed border-black/15 text-neutral-400 dark:border-white/20"
            >
              <IconPlus className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              aria-label="사진 추가(카메라)"
              className="flex size-20 items-center justify-center rounded-xl border border-dashed border-black/15 text-neutral-400 dark:border-white/20"
            >
              <IconCamera className="size-5" />
            </button>
          </div>
          <p className="mt-3 text-[12px] text-neutral-400">{hint}</p>
          {error && <p className="mt-2 text-[13px] text-red-500">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={clearQueue}
              disabled={uploading}
              className="flex-1 rounded-2xl border border-black/10 py-3 text-[15px] font-medium text-neutral-600 disabled:opacity-50 dark:border-white/15 dark:text-neutral-300"
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirmUpload}
              disabled={uploading}
              className="flex-1 rounded-2xl bg-blue-600 py-3 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {uploading ? "처리 중..." : `사진 ${queue.length}장 등록`}
            </button>
          </div>
        </div>
      )}

      {receipts.length > 0 && (
        <div>
          <h3 className="px-1 text-[13px] font-medium uppercase tracking-wide text-neutral-400">
            등록된 영수증 ({receipts.length}) · 탭하면 인식 결과를 볼 수 있어요
          </h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {receipts.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedId((cur) => (cur === r.id ? null : r.id))}
                className={`group relative aspect-square overflow-hidden rounded-2xl border bg-neutral-100 text-left dark:bg-white/5 ${
                  selectedId === r.id
                    ? "border-blue-500 ring-2 ring-blue-500/40"
                    : "border-black/5 dark:border-white/10"
                }`}
              >
                {r.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.images[0].path} alt="등록된 영수증" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <IconPhoto className="size-6 text-neutral-300" />
                  </div>
                )}
                {r.images.length > 1 && (
                  <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    +{r.images.length - 1}
                  </span>
                )}
                <span
                  className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${VERDICT_BADGE_CLASS[r.verdictStatus]}`}
                >
                  {VERDICT_LABEL[r.verdictStatus]}
                </span>
                {r.verdictAmount !== null && (
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[11px] font-medium text-white">
                    {r.verdictAmount.toLocaleString("ko-KR")}원
                  </span>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeReceipt(r.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      removeReceipt(r.id);
                    }
                  }}
                  aria-label="영수증 삭제"
                  className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-red-500/90"
                >
                  <IconTrash className="size-3.5" />
                </span>
              </button>
            ))}
          </div>
          {selectedReceipt && (
            <div className="mt-3">
              <OcrDetailCard
                receipt={selectedReceipt}
                onReanalyze={reanalyzeReceipt}
                reanalyzing={reanalyzingId === selectedReceipt.id}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
