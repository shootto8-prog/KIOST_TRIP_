"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
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
  // 보는 사람 기기 타임존과 무관하게 항상 한국 시각으로 표시한다.
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
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
  // 인정/불인정과 헷갈리지 않도록 판정 색(초록/빨강/주황)과 다른 중립적인 파란색을 쓴다.
  SUBMITTED: "bg-blue-500/90 text-white",
};

/**
 * "다시 인식 시도" 버튼을 띄워야 하는 판정들. 인식 자체가 안 된 경우(ocr_unavailable),
 * 여러 장 중 일부만 인식돼 금액이 조용히 빠진 경우(partial_ocr_failure), 금액을 추정값으로만
 * 읽어 판정을 보류한 경우(amount_estimated)는 모두 재시도로 나아질 수 있다.
 */
const RETRYABLE_FAILED_CHECKS = new Set([
  "ocr_unavailable",
  "partial_ocr_failure",
  "amount_estimated",
]);

/** 파일 확장자로 MIME 타입을 추정한다 - 일부 안드로이드 브라우저/파일관리자는 File.type이 ""로 온다. */
const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

function resolveContentType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? "";
}

/**
 * 업로드 실패 원인을 구분해서 보여준다. 예전에는 형식/크기 문제든 권한 문제든 전부
 * "네트워크 오류가 발생했습니다"로 뭉개져, 사용자가 원인을 모른 채 같은 파일로 재시도했다.
 */
function describeUploadError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  const lower = message.toLowerCase();
  if (/content type|content-type|형식|allowed/.test(lower)) {
    return "지원하지 않는 파일 형식입니다. JPG, PNG, HEIC, PDF 파일만 올릴 수 있습니다.";
  }
  if (/size|too large|크기/.test(lower)) {
    return "파일 크기가 너무 큽니다(최대 30MB). 사진 크기를 줄여 다시 시도해 주세요.";
  }
  if (/권한|찾을 수 없|본인 확인/.test(message)) {
    return message;
  }
  if (/abort|timeout|시간/.test(lower)) {
    return "처리 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "네트워크 오류가 발생했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.";
}

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
          : receipt.verdictStatus === "SUBMITTED"
          ? "bg-blue-500/10"
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
            {receipt.verdictAmount.toLocaleString("ko-KR")}원
            {/* SUBMITTED는 자동판정이 아니라 사람이 직접 입력한 금액이라 "인정"이라고 하면
                오해를 준다 - 판정이 실제로 이뤄진 상태에서만 "인정"을 붙인다. */}
            {receipt.verdictStatus !== "SUBMITTED" && " 인정"}
          </span>
        )}
      </div>
      {receipt.verdictStatus === "SUBMITTED" && receipt.ocrDateGuess && (
        // 자동정산 미사용 조식은 OCR을 안 돌려 "인식 결과" 카드 자체가 안 뜬다 - 직접 입력한
        // 일시를 그대로 잃어버리지 않도록 여기 배너에 보여준다.
        <p className="mt-1 text-[12.5px] text-neutral-500 dark:text-neutral-400">
          입력한 일시: {formatOcrDate(receipt.ocrDateGuess)}
        </p>
      )}
      {receipt.verdictMessage && (
        // 교통 부분인정 메시지처럼 "N번째 사진: ..." 여러 줄이 올 수 있어 줄바꿈을 살린다.
        <p className="mt-2 whitespace-pre-line text-neutral-700 dark:text-neutral-300">
          {receipt.verdictMessage}
        </p>
      )}
      {receipt.verdictRegulationRef && (
        <p className="mt-2 text-[11px] text-neutral-400">근거: {receipt.verdictRegulationRef}</p>
      )}
      {RETRYABLE_FAILED_CHECKS.has(receipt.verdictFailedCheck ?? "") && (
        <button
          type="button"
          onClick={() => onReanalyze(receipt.id)}
          disabled={reanalyzing}
          className="mt-3 w-full rounded-full bg-neutral-900 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
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
          src={`/api/receipts/image/${img.id}`}
          alt="첨부 사진"
          loading="lazy"
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
                className="mt-3 text-[12px] font-medium text-brand dark:text-brand-light"
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
  autoSettlement,
}: {
  tripId: string;
  category: Category;
  transportMode?: TransportMode;
  initialReceipts: ReceiptItem[];
  /** false면 이 출장은 OCR/자동판정을 쓰지 않는다 - 안내 문구를 판정 대신 "제출" 기준으로 바꾼다. */
  autoSettlement: boolean;
}) {
  const router = useRouter();
  const [receipts, setReceipts] = useState<ReceiptItem[]>(initialReceipts);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  const [manualAmount, setManualAmount] = useState("");
  const [manualDatetime, setManualDatetime] = useState("");
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const flatRate = isFlatRate(transportMode);
  // 조식은 한 영수증 = 한 장으로 제한한다 (다른 항목처럼 여러 장을 페이지/왕복권으로 합쳐 볼
  // 이유가 없고, 여러 장 올리면 오히려 오인식 위험만 커진다).
  const isBreakfast = category === "BREAKFAST";
  // 자동정산을 안 쓰면 조식/교통(선박·항공)/숙박은 금액을 사람이 직접 입력해야 한다 - 현장사진과
  // 정액정산 교통수단(고속철도/승용/버스)은 원래도 금액 개념이 없다. 조식은 05:00~10:00 시간대를
  // 사람이 눈으로 확인해야 하므로 일시도 함께 받는다. (GAS 버전 수동입력 방식 참고, 2026-08-07)
  const needsManualAmount = !autoSettlement && category !== "FIELD" && !flatRate;
  const needsManualDatetime = !autoSettlement && isBreakfast;

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const incoming = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setQueue((prev) => (isBreakfast ? incoming.slice(0, 1) : [...prev, ...incoming]));
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
    setManualAmount("");
    setManualDatetime("");
    setError(null);
  }

  async function confirmUpload() {
    if (queue.length === 0) return;
    // 서버도 같은 조건으로 다시 검증하지만, 여기서 먼저 막아야 사진을 다 올린 뒤에 실패해
    // Blob에 고아 파일이 쌓이는 걸 피할 수 있다.
    let parsedAmount: number | null = null;
    if (needsManualAmount) {
      parsedAmount = Number(manualAmount);
      if (!manualAmount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        setError("금액을 올바르게 입력해 주세요.");
        return;
      }
    }
    if (needsManualDatetime && !manualDatetime.trim()) {
      setError("결제 일시를 입력해 주세요.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      // 사진을 우리 서버가 아니라 브라우저에서 Vercel Blob으로 직접 올린다 - Vercel 서버리스
      // 함수는 요청 본문이 4.5MB로 제한돼 있어, 휴대폰 카메라 사진(보통 5MB+)을 서버를 거쳐
      // 올리면 실패한다.
      const blobs: { url: string; contentType: string }[] = [];
      for (const q of queue) {
        // 일부 안드로이드 브라우저는 File.type이 빈 문자열이라 그대로 보내면 타입 검증에서
        // 실패한다 - 확장자로 추정해 채워 넣는다.
        const contentType = resolveContentType(q.file);
        if (!contentType) {
          setError(
            `"${q.file.name}"의 파일 형식을 알 수 없습니다. JPG, PNG, HEIC, PDF 파일로 다시 선택해 주세요.`
          );
          setUploading(false);
          return;
        }
        // 영수증 사진엔 카드번호 일부·승인번호·이름이 찍혀있다 - "public"이면 URL만 알면
        // 로그인 없이 누구나 영구히 열람할 수 있어 "private"로 올린다(서버의
        // /api/receipts/upload도 private을 강제하지만, 실제 저장 여부는 이 클라이언트 호출의
        // access 값이 결정한다 - 둘 중 하나만 바꾸면 안 된다). (2026-08-07)
        const blob = await upload(`uploads/${tripId}/${category.toLowerCase()}/${q.file.name}`, q.file, {
          access: "private",
          handleUploadUrl: "/api/receipts/upload",
          contentType,
        });
        blobs.push({ url: blob.url, contentType });
      }

      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          category,
          transportMode,
          blobs,
          ...(needsManualAmount ? { manualAmount: parsedAmount } : {}),
          ...(needsManualDatetime ? { manualDatetime } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          data?.error ??
            (res.status === 504
              ? "처리 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."
              : "업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.")
        );
        setUploading(false);
        return;
      }
      setReceipts((prev) => [data.receipt, ...prev]);
      setSelectedId(data.receipt.id);
      setQueue([]);
      setManualAmount("");
      setManualDatetime("");
      setUploading(false);
      router.refresh();
    } catch (err) {
      // 원인을 뭉개서 전부 "네트워크 오류"로 띄우면, 사용자는 재시도해야 할지 파일을 바꿔야 할지
      // 알 수 없고 그때마다 앞쪽 사진만 Blob에 쌓인다.
      setError(describeUploadError(err));
      setUploading(false);
    }
  }

  async function reanalyzeReceipt(id: string) {
    setReanalyzingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${id}/reanalyze`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.receipt) {
        setReceipts((prev) => prev.map((r) => (r.id === id ? data.receipt : r)));
        router.refresh();
      } else {
        // 왜 안 됐는지 알려준다 - 예전에는 조용히 무시돼서 버튼만 원래대로 돌아왔다.
        setError(
          data?.error ??
            (res.status === 504
              ? "인식에 시간이 너무 오래 걸렸습니다. 잠시 후 다시 시도해 주세요."
              : "다시 인식하지 못했습니다. 잠시 후 다시 시도해 주세요.")
        );
      }
    } catch {
      setError("네트워크 오류로 다시 인식하지 못했습니다. 연결 상태를 확인해 주세요.");
    } finally {
      setReanalyzingId(null);
    }
  }

  async function removeReceipt(id: string) {
    const previous = receipts;
    setReceipts((prev) => prev.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
    try {
      const res = await fetch(`/api/receipts?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        // 서버가 거부했으면(권한 없음 등) 화면에서 지운 것을 되돌린다 - 지워진 것처럼 보이는데
        // 실제로는 남아 있는 상태가 가장 나쁘다.
        const data = await res.json().catch(() => null);
        setReceipts(previous);
        setError(data?.error ?? "영수증을 삭제하지 못했습니다.");
        return;
      }
    } catch {
      setReceipts(previous);
      setError("네트워크 오류로 영수증을 삭제하지 못했습니다.");
      return;
    }
    router.refresh();
  }

  const selectedReceipt = receipts.find((r) => r.id === selectedId) ?? null;

  const hint = !autoSettlement
    ? category === "FIELD"
      ? "증빙용 사진입니다. 첨부하면 제출 처리됩니다."
      : "이 출장은 자동정산을 사용하지 않습니다. 사진을 올리면 AI 판정 없이 증빙으로 제출만 됩니다 - 담당자가 직접 확인합니다."
    : category === "FIELD"
    ? "판정 대상이 아닌 증빙용 사진입니다. 첨부하면 바로 인정 처리됩니다."
    : flatRate
    ? "정액정산 대상으로 금액 확인 없이 사진만 첨부하면 바로 인정됩니다."
    : category === "TRANSPORT"
    ? "왕복 등 결제가 여러 건이면 사진을 각각 추가해 주세요 - 사진별로 인식한 금액을 자동으로 합산합니다."
    : isBreakfast
    ? null
    : category === "LODGING"
    ? "여러 장이면 같은 영수증의 다음 페이지로 보고 합쳐서 인식합니다. 서로 다른 숙소·숙박 건은 한 번에 올리지 말고 건별로 따로 등록해 주세요."
    : "여러 장이면 같은 영수증의 다음 페이지로 보고 합쳐서 인식합니다.";

  return (
    <div className="space-y-4">
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple={!isBreakfast}
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
            className="shadow-soft flex flex-1 items-center justify-center gap-2 rounded-[20px] border border-black/5 bg-white/80 py-4 text-[15px] font-medium text-neutral-700 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-200"
          >
            <IconPhoto />
            사진 선택(갤러리)
          </button>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="shadow-glow flex flex-1 items-center justify-center gap-2 rounded-[20px] bg-brand py-4 text-[15px] font-semibold text-white active:scale-[0.98]"
          >
            <IconCamera />
            카메라로 촬영
          </button>
        </div>
      ) : (
        <div className="shadow-soft rounded-[24px] border border-black/5 bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
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
            {!(isBreakfast && queue.length >= 1) && (
              <>
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
              </>
            )}
          </div>
          {(needsManualAmount || needsManualDatetime) && (
            <div className="mt-3 space-y-2.5">
              {needsManualAmount && (
                <div>
                  <label className="mb-1 block text-[12.5px] font-medium text-neutral-600 dark:text-neutral-300">
                    금액
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    placeholder="예: 15000"
                    value={manualAmount}
                    onChange={(e) => setManualAmount(e.target.value)}
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[15px] text-neutral-900 outline-none focus:border-brand dark:border-white/15 dark:bg-white/5 dark:text-neutral-100"
                  />
                </div>
              )}
              {needsManualDatetime && (
                <div>
                  <label className="mb-1 block text-[12.5px] font-medium text-neutral-600 dark:text-neutral-300">
                    결제 일시
                  </label>
                  <input
                    type="datetime-local"
                    value={manualDatetime}
                    onChange={(e) => setManualDatetime(e.target.value)}
                    className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[15px] text-neutral-900 outline-none focus:border-brand dark:border-white/15 dark:bg-white/5 dark:text-neutral-100"
                  />
                </div>
              )}
            </div>
          )}
          {hint && <p className="mt-3 text-[12px] text-neutral-400">{hint}</p>}
          {error && <p className="mt-2 text-[13px] text-red-500">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={clearQueue}
              disabled={uploading}
              className="flex-1 rounded-full border border-black/10 py-3 text-[15px] font-medium text-neutral-600 disabled:opacity-50 dark:border-white/15 dark:text-neutral-300"
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirmUpload}
              disabled={uploading}
              className="shadow-glow flex-1 rounded-full bg-brand py-3 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {uploading ? "처리 중..." : `사진 ${queue.length}장 등록`}
            </button>
          </div>
        </div>
      )}

      {/* 업로드 대기열이 비어 있을 때(삭제 실패 등)도 오류가 보이도록 별도로 한 번 더 표시한다. */}
      {error && queue.length === 0 && <p className="px-1 text-[13px] text-red-500">{error}</p>}

      {receipts.length > 0 && (
        <div>
          <h3 className="px-1 text-[13px] font-medium uppercase tracking-wide text-neutral-400">
            등록된 영수증 ({receipts.length})
            {autoSettlement ? " · 탭하면 인식 결과를 볼 수 있어요" : " · 탭하면 상세 사진을 볼 수 있어요"}
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
                  <img
                    src={`/api/receipts/image/${r.images[0].id}`}
                    alt="등록된 영수증"
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
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
