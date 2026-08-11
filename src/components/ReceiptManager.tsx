"use client";

import { useEffect, useRef, useState } from "react";
import { IconCamera, IconPhoto, IconTrash, IconPdf, IconPlus, IconMap } from "./icons";
import type { ReceiptItem } from "@/lib/receipt";
import { verdictDisplayLabel, isManuallyReviewedCategory, formatDateTime } from "@/lib/format";
import { FLAT_RATE_TRANSPORT_MODES } from "@/lib/verifyReceipt";
import { getKstParts } from "@/lib/kst";
import { createReceipt, addReceiptImage, deleteReceipt, updateReceipt } from "@/lib/localDb";
import { getReceiptImageBytes } from "@/lib/localDb";
import { useReceiptImageUrl } from "@/lib/useObjectUrl";
import { isHeic } from "@/lib/imageMime";
import { heicToJpeg } from "@/lib/heicConvertClient";
import { toThumbnailJpeg } from "@/lib/imageConvertClient";
import { stampDateTime, getCurrentCoords } from "@/lib/imageStampClient";
import { fetchLocationSnapshot } from "@/lib/naverMapClient";
import { renderAllPdfPagesToPng } from "@/lib/pdfToImageClient";
import { sumAcceptedLodging } from "@/lib/tripSummaryLocal";
import { tripTotalDays, exceedsLodgingIntranetThreshold } from "@/lib/settlementFormat";
import TransportRoutePicker, { resolveRouteFare, type RouteSelection } from "./TransportRoutePicker";
import type { PositionGrade, SettlementMode } from "@/lib/localDb";

export type { ReceiptItem };

type TransportMode = "SHIP" | "AIR" | "RAIL" | "PRIVATE_CAR" | "BUS";
type Category = "BREAKFAST" | "TRANSPORT" | "LODGING" | "FIELD";
type StopType = "DEPARTURE" | "STOPOVER" | "ARRIVAL";

function isFlatRate(mode?: TransportMode): boolean {
  return !!mode && (FLAT_RATE_TRANSPORT_MODES as readonly string[]).includes(mode);
}

function buildRouteVerdictMessage(sel: RouteSelection): string {
  const parts = [sel.label, sel.roundTrip ? "왕복" : "편도"];
  if (sel.rent) parts.push("렌트");
  if (sel.carpool) parts.push("동승");
  let message = parts.join(" · ");
  if (sel.rent || sel.carpool) message += " (정액 미적용, 0원 처리)";
  return message;
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

/** epoch ms를 <input type="datetime-local">이 요구하는 "YYYY-MM-DDTHH:mm" 문자열로, 항상
 * 한국 시각 기준으로 바꾼다 - 촬영 시각 자동입력용. */
function toKstDatetimeLocalValue(epochMs: number): string {
  const { year, month, day, hour, minute } = getKstParts(new Date(epochMs));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

const VERDICT_BADGE_CLASS_AUTO: Record<ReceiptItem["verdictStatus"], string> = {
  APPROVED: "bg-emerald-500/90 text-white",
  PARTIAL: "bg-amber-500/90 text-white",
  REJECTED: "bg-red-500/90 text-white",
  PENDING: "bg-neutral-400/90 text-white",
  // 인정/불인정과 헷갈리지 않도록 판정 색(초록/빨강/주황)과 다른 중립적인 파란색을 쓴다.
  SUBMITTED: "bg-blue-500/90 text-white",
};

/**
 * 자동정산 미사용 출장은 "인정(초록)/불인정(빨강)"처럼 최종 확정을 암시하는 색을 쓰지 않는다.
 * 문제 없으면(확인) 파란색, 담당자 확인이 필요하면(확인요청) 주황색만 쓴다 - 반려(REJECTED)도
 * "빨강 = 거부됨"이 아니라 "확인요청"과 똑같이 담당자가 봐야 한다는 의미라 같은 색으로 묶는다.
 */
function verdictBadgeClass(receipt: ReceiptItem, autoSettlement: boolean): string {
  if (autoSettlement) return VERDICT_BADGE_CLASS_AUTO[receipt.verdictStatus];
  if (!isManuallyReviewedCategory(receipt.category, receipt.transportMode)) return "bg-blue-500/90 text-white";
  if (receipt.verdictStatus === "APPROVED") return "bg-blue-500/90 text-white";
  if (receipt.verdictStatus === "PARTIAL" || receipt.verdictStatus === "REJECTED") {
    return "bg-amber-500/90 text-white";
  }
  return "bg-blue-500/90 text-white";
}

function verdictBannerBgClass(receipt: ReceiptItem, autoSettlement: boolean): string {
  if (autoSettlement) {
    return receipt.verdictStatus === "APPROVED"
      ? "bg-emerald-500/10"
      : receipt.verdictStatus === "PARTIAL"
      ? "bg-amber-500/10"
      : receipt.verdictStatus === "REJECTED"
      ? "bg-red-500/10"
      : receipt.verdictStatus === "SUBMITTED"
      ? "bg-blue-500/10"
      : "bg-neutral-500/10";
  }
  if (isManuallyReviewedCategory(receipt.category, receipt.transportMode) &&
    (receipt.verdictStatus === "PARTIAL" || receipt.verdictStatus === "REJECTED")) {
    return "bg-amber-500/10";
  }
  return "bg-blue-500/10";
}

/** "OOO원" 뒤에 붙이는 짧은 접미사 - 자동정산 미사용이면 뱃지와 같은 단어("확인"/"확인요청")를
 * 그대로 붙여 일관되게 보이게 한다. 판정 자체가 없는 항목(제출)에는 접미사를 붙이지 않는다. */
function amountSuffix(receipt: ReceiptItem, autoSettlement: boolean): string {
  if (autoSettlement) return receipt.verdictStatus !== "SUBMITTED" ? " 인정" : "";
  const label = verdictDisplayLabel(receipt.verdictStatus, false, receipt.category, receipt.transportMode);
  return label === "제출" ? "" : ` ${label}`;
}

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

/** Blob을 서버로 보낼 수 있게 base64 문자열로 바꾼다 - 큰 이미지에서 콜스택이 안 터지도록
 * 청크 단위로 처리한다(String.fromCharCode(...bigArray) 한 방에 하면 인자 개수 제한에 걸릴 수 있음). */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** HEIC/PDF 변환처럼 원인을 구체적으로 짚어 만든 에러 - describeUploadError가 이 메시지를
 * 뭉개지 않고 그대로 보여주게 하는 표식이다(2026-08-11, 아래 설명 참고). */
class UploadStepError extends Error {}

/**
 * 업로드 실패 원인을 구분해서 보여준다. 예전에는 형식/크기 문제든 통신 문제든 전부
 * "네트워크 오류가 발생했습니다"로 뭉개져, 사용자가 원인을 모른 채 같은 파일로 재시도했다.
 *
 * HEIC/PDF 변환 실패처럼 이미 구체적인 원인 메시지를 만들어 던진 경우(UploadStepError)는
 * 그 메시지를 그대로 보여준다 - 예전엔 여기서 무조건 이 함수가 다시 일반 메시지로 덮어써서,
 * "아이폰 사진(HEIC)을 변환하지 못했습니다" 같은 실제 원인이 화면에 뜨지 못하고 "연결 상태를
 * 확인해 주세요"만 보여 사용자가 원인을 알 수 없었다(2026-08-11 실사용 버그로 발견).
 */
function describeUploadError(err: unknown): string {
  if (err instanceof UploadStepError) return err.message;
  const message = err instanceof Error ? err.message : "";
  const lower = message.toLowerCase();
  if (/abort|timeout|시간/.test(lower)) {
    return "처리 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.";
  }
  return "처리 중 오류가 발생했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.";
}

function VerdictBanner({
  receipt,
  onReanalyze,
  reanalyzing,
  autoSettlement,
}: {
  receipt: ReceiptItem;
  onReanalyze: (id: string) => void;
  reanalyzing: boolean;
  autoSettlement: boolean;
}) {
  return (
    <div className={`rounded-2xl p-4 text-[13px] ${verdictBannerBgClass(receipt, autoSettlement)}`}>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${verdictBadgeClass(receipt, autoSettlement)}`}
        >
          {verdictDisplayLabel(receipt.verdictStatus, autoSettlement, receipt.category, receipt.transportMode)}
        </span>
        {receipt.verdictAmount !== null && (
          <span className="text-[15px] font-bold text-neutral-900 dark:text-neutral-100">
            {receipt.verdictAmount.toLocaleString("ko-KR")}원
            {amountSuffix(receipt, autoSettlement)}
          </span>
        )}
      </div>
      {receipt.ocrStatus === "PENDING" && receipt.ocrDateGuess && (
        // 자동정산 미사용 조식은 OCR을 안 돌려 "인식 결과" 카드 자체가 안 뜬다(ocrStatus가
        // 항상 PENDING) - 직접 입력한 일시를 그대로 잃어버리지 않도록 여기 배너에 보여준다.
        // 판정 결과(인정/불인정 등)와 무관하게, 입력값이 있으면 항상 보여준다.
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

/** 로컬(IndexedDB)에 암호화 저장된 이미지를 복호화해 보여준다. */
function ReceiptImg({
  imageId,
  variant,
  alt,
  className,
}: {
  imageId: string;
  variant: "full" | "thumb";
  alt: string;
  className: string;
}) {
  const url = useReceiptImageUrl(imageId, variant);
  if (!url) {
    return (
      <div className={`${className} flex items-center justify-center bg-neutral-100 dark:bg-white/5`}>
        <IconPhoto className="size-5 text-neutral-300" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" className={className} />;
}

function ImageGallery({ receipt }: { receipt: ReceiptItem }) {
  if (receipt.images.length <= 1) return null;
  return (
    <div className="flex gap-2 overflow-x-auto">
      {receipt.images.map((img) => (
        <ReceiptImg
          key={img.id}
          imageId={img.id}
          variant="thumb"
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
  autoSettlement,
}: {
  receipt: ReceiptItem;
  onReanalyze: (id: string) => void;
  reanalyzing: boolean;
  autoSettlement: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const ocrSkipped = receipt.ocrStatus === "PENDING";
  return (
    <div className="space-y-3">
      <VerdictBanner receipt={receipt} onReanalyze={onReanalyze} reanalyzing={reanalyzing} autoSettlement={autoSettlement} />
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

type QueuedFile = {
  id: string;
  file: File;
  url: string;
  fromCamera: boolean;
  capturedAt: number;
};
type TripStopInput = { type: StopType; location: string };

export default function ReceiptManager({
  tripId,
  category,
  transportMode,
  initialReceipts,
  settlementMode,
  autoSettlement,
  grade,
  tripStartDate,
  tripEndDate,
  tripStops,
  onChange,
}: {
  tripId: string;
  category: Category;
  transportMode?: TransportMode;
  /** 이 컴포넌트의 진짜 데이터 소스는 부모(useReceipts 훅)다 - 로컬 상태로 복제하지 않고
   * 그대로 그린다. 변경 후에는 onChange()로 부모에게 다시 읽어오라고 알린다. */
  initialReceipts: ReceiptItem[];
  /** 간편모드에서는 TRANSPORT 카테고리의 구간(정액정산) 메뉴를 숨긴다 - 조식/숙박/현장사진은
   * 이 값과 무관하게 항상 동일하게 동작한다(2026-08-11). 안 넘기면 기존 동작(상세모드)과 같다. */
  settlementMode?: SettlementMode;
  autoSettlement: boolean;
  /** 고속철도 구간 검색에 필요(직급별 요금) - TRANSPORT 카테고리가 아니면 안 써도 된다. */
  grade?: PositionGrade | null;
  tripStartDate: string;
  tripEndDate: string;
  tripStops: TripStopInput[];
  onChange?: () => void;
}) {
  const receipts = initialReceipts;
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  const [manualAmount, setManualAmount] = useState("");
  const [manualDatetime, setManualDatetime] = useState("");
  // 경유·환승 등으로 한 번에 여러 구간을 등록할 수 있어(2026-08-10, 사용자 요청) 배열로 관리한다 -
  // 제출 시 선택된 구간 수만큼 영수증을 각각 만든다.
  const [routeSelections, setRouteSelections] = useState<RouteSelection[]>([]);
  // 현장사진에서만 쓰는 "네이버지도 인증하기" - 서버에 키가 설정돼 있을 때만 버튼을 보여준다
  // (email-status와 같은 패턴, 2026-08-11). 간편/상세모드 공통 기능이라 settlementMode와 무관하다.
  const [naverMapEnabled, setNaverMapEnabled] = useState(false);
  const [verifyingLocation, setVerifyingLocation] = useState(false);
  useEffect(() => {
    if (category !== "FIELD") return;
    fetch("/api/naver-map/status")
      .then((res) => res.json())
      .then((data) => setNaverMapEnabled(Boolean(data?.enabled)))
      .catch(() => setNaverMapEnabled(false));
  }, [category]);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // 숙박 "인트라넷 안내" 기준(1박당 80,000원 초과) - 사내 시스템이 영수증 건별로 나누지 않고
  // "출장 전체 숙박 합계 ÷ 전체 박수"만 기계적으로 보므로(2026-08-10, 사용자 확인), 이 앱도
  // 영수증 개별이 아니라 이 카테고리에 등록된 숙박 영수증 전체 합계로 딱 한 번만 판단한다 -
  // 영수증을 여러 건(호텔 여러 곳 등)으로 나눠 올려도 정확하다. 0박(당일 출장)은 애초에
  // 숙박 자체가 반려되므로 나오지 않지만, 방어적으로 최소 1로 둔다.
  const tripNightsForLodging = Math.max(1, tripTotalDays(tripStartDate, tripEndDate) - 1);
  const lodgingTotalAccepted =
    category === "LODGING" ? receipts.reduce((s, r) => s + (r.verdictAmount ?? 0), 0) : 0;
  const lodgingExceedsIntranetThreshold =
    category === "LODGING" && exceedsLodgingIntranetThreshold(lodgingTotalAccepted, tripNightsForLodging);

  const flatRate = isFlatRate(transportMode);
  // 정액정산 교통수단(고속철도/승용/버스)은 자유 입력 대신 TRANS 요금표에서 구간을 검색해
  // 고르게 한다(오타로 엉뚱한 구간이 등록되는 것 방지, 2026-08-10). 자동정산 사용 여부와 무관하게
  // 항상 적용된다 - 요금이 정액(테이블 값)이라 AI 판정 대상이 아니기 때문이다.
  const needsRouteSelection = category === "TRANSPORT" && flatRate && (settlementMode ?? "DETAILED") === "DETAILED";
  // 버스만 사진 선택 전에도 구간 검색창이 바로 보인다 - 고속철도/승용은 사진을 먼저 담아야
  // 나타나는 기존 방식 그대로 둔다(2026-08-10, 사용자 확인 - 버스만 바꿔달라는 요청).
  const showRouteInline = needsRouteSelection && transportMode === "BUS";
  const showRouteInQueue = needsRouteSelection && !showRouteInline;
  // 출장정보에 등록한 출발지/목적지를 구간 검색창 기본값으로 미리 채워둔다 - 같은 지명을
  // 매번 다시 치는 게 번거롭다는 피드백 반영(2026-08-10).
  const routeDefaultFrom = tripStops.find((s) => s.type === "DEPARTURE")?.location ?? "";
  const routeDefaultTo = tripStops.find((s) => s.type === "ARRIVAL")?.location ?? "";
  // 조식은 한 영수증 = 한 장으로 제한한다 (다른 항목처럼 여러 장을 페이지/왕복권으로 합쳐 볼
  // 이유가 없고, 여러 장 올리면 오히려 오인식 위험만 커진다).
  const isBreakfast = category === "BREAKFAST";
  // 자동정산을 안 쓰면 조식/교통(선박·항공)/숙박은 금액을 사람이 직접 입력해야 한다 - 현장사진과
  // 정액정산 교통수단(고속철도/승용/버스)은 원래도 금액 개념이 없다. 조식은 05:00~10:00 시간대를
  // 사람이 눈으로 확인해야 하므로 일시도 함께 받는다. (GAS 버전 수동입력 방식 참고, 2026-08-07)
  const needsManualAmount = !autoSettlement && category !== "FIELD" && !flatRate;
  const needsManualDatetime = !autoSettlement && isBreakfast;

  function addFiles(files: FileList | null, fromCamera: boolean) {
    if (!files || files.length === 0) return;
    setError(null);
    const capturedAt = Date.now();
    const incoming = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      url: URL.createObjectURL(file),
      fromCamera,
      capturedAt,
    }));
    setQueue((prev) => (isBreakfast ? incoming.slice(0, 1) : [...prev, ...incoming]));
    // 조식은 결제 일시를 매번 손으로 입력하기 번거로우니, 사진을 큐에 담는 지금 이 순간(브라우저
    // 현재 시각)으로 미리 채워둔다. 카메라로 막 찍은 경우 사실상 촬영 시각과 같다.
    if (needsManualDatetime && incoming.length > 0) {
      setManualDatetime(toKstDatetimeLocalValue(capturedAt));
    }
  }

  function onGalleryPicked(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files, false);
    e.target.value = "";
  }

  function onCameraPicked(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files, true);
    e.target.value = "";
  }

  function removeQueued(id: string) {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  }

  function clearQueue() {
    setQueue([]);
    setManualAmount("");
    setManualDatetime("");
    setRouteSelections([]);
    setError(null);
  }

  async function confirmUpload() {
    // 버스는 사진 없이 구간(+왕복 체크)만으로도 등록할 수 있다 - 버스표를 따로 안 챙기는
    // 경우가 있다는 실사용 피드백 반영(2026-08-10). 그 외에는 여전히 사진이 최소 1장 필요하다.
    const canSubmitRouteOnly = showRouteInline && routeSelections.length > 0;
    if (queue.length === 0 && !canSubmitRouteOnly) return;
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
      // 현장사진을 카메라로 직접 촬영한 경우에만 촬영 시각 스탬프를 새긴다 - 갤러리에서 고른
      // 기존 사진은 실제 촬영 시각을 알 수 없어 찍지 않는다(2026-08-11).
      const needsCameraStamp = (q: QueuedFile) => category === "FIELD" && q.fromCamera;

      // 1) 각 파일을 이미지 Blob 1개 이상으로 정규화한다 - HEIC는 JPEG로, PDF는 페이지별 PNG로
      // 바꾼다(다중 페이지면 페이지 수만큼 이미지가 생긴다). 나머지는 그대로 쓴다.
      const converted: Blob[] = [];
      for (const q of queue) {
        const contentType = resolveContentType(q.file);
        if (!contentType) {
          setError(`"${q.file.name}"의 파일 형식을 알 수 없습니다. JPG, PNG, HEIC, PDF 파일로 다시 선택해 주세요.`);
          setUploading(false);
          return;
        }
        if (contentType === "application/pdf") {
          const bytes = new Uint8Array(await q.file.arrayBuffer());
          const pages = await renderAllPdfPagesToPng(bytes).catch((err) => {
            console.error("PDF 변환 실패:", err);
            throw new UploadStepError("PDF 파일을 이미지로 변환하지 못했습니다. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다.");
          });
          converted.push(...pages);
        } else if (isHeic(contentType, q.file.name)) {
          const jpeg = await heicToJpeg(q.file).catch((err) => {
            console.error("HEIC 변환 실패:", err);
            throw new UploadStepError("아이폰 사진(HEIC)을 변환하지 못했습니다. 파일이 손상되었거나 지원되지 않는 형식일 수 있습니다.");
          });
          converted.push(needsCameraStamp(q) ? await stampDateTime(jpeg, new Date(q.capturedAt)) : jpeg);
        } else {
          converted.push(
            needsCameraStamp(q) ? await stampDateTime(q.file, new Date(q.capturedAt)) : q.file
          );
        }
      }

      // 2) 판정 - 정액정산 교통수단(고속철도/승용/버스)은 TRANS 요금표 조회 결과를 그대로
      // 쓴다(AI/서버 판정이 필요 없는 결정론적 값이라 네트워크를 타지 않는다). 그 외에는
      // autoSettlement일 때만 사진 바이트를 함께 보내 서버에서 판정받는다.
      type Analysis = {
        ocrStatus: "PENDING" | "DONE" | "FAILED";
        ocrText: string | null;
        ocrAmountGuess: number | null;
        ocrDateGuess: string | null;
        ocrMerchantGuess: string | null;
        ocrModel: string | null;
        verdict: {
          status: "PENDING" | "APPROVED" | "PARTIAL" | "REJECTED" | "SUBMITTED";
          acceptedAmount: number | null;
          message: string | null;
          failedCheckId: string | null;
          regulationRef: string | null;
        };
      };

      // 3) 로컬(IndexedDB)에 판정 결과와 이미지를 저장한다. 사진(images)은 호출부가 정한다 -
      // 구간을 여러 개 등록할 때는 사진을 어느 구간에 나눠 붙여야 할지 알 수 없어(추측하지
      // 않고) 첫 번째 구간에만 붙인다.
      async function saveReceipt(analysis: Analysis, images: Blob[]) {
        const created = await createReceipt({
          tripId,
          category,
          transportMode: transportMode ?? null,
          ocrStatus: analysis.ocrStatus,
          ocrText: analysis.ocrText,
          ocrAmountGuess: analysis.ocrAmountGuess,
          ocrDateGuess: analysis.ocrDateGuess,
          ocrMerchantGuess: analysis.ocrMerchantGuess,
          ocrModel: analysis.ocrModel,
          verdictStatus: analysis.verdict.status,
          verdictAmount: analysis.verdict.acceptedAmount,
          verdictMessage: analysis.verdict.message,
          verdictFailedCheck: analysis.verdict.failedCheckId,
          verdictRegulationRef: analysis.verdict.regulationRef,
        });
        for (const [i, blob] of images.entries()) {
          const fullBytes = await blob.arrayBuffer();
          const thumbBlob = await toThumbnailJpeg(blob).catch(() => null);
          const thumbBytes = thumbBlob ? await thumbBlob.arrayBuffer() : null;
          await addReceiptImage({
            receiptId: created.id,
            order: i,
            mimeType: blob.type || "image/jpeg",
            fullBytes,
            thumbBytes,
          });
        }
        return created;
      }

      let lastCreatedId: string | null = null;

      if (needsRouteSelection && routeSelections.length > 0) {
        let firstReceipt = true;
        for (const sel of routeSelections) {
          const routeAnalysis: Analysis = {
            ocrStatus: "PENDING",
            ocrText: null,
            ocrAmountGuess: null,
            ocrDateGuess: null,
            ocrMerchantGuess: null,
            ocrModel: null,
            verdict: {
              status: "APPROVED",
              acceptedAmount: resolveRouteFare(sel),
              message: buildRouteVerdictMessage(sel),
              failedCheckId: null,
              regulationRef: null,
            },
          };
          const created = await saveReceipt(routeAnalysis, firstReceipt ? converted : []);
          lastCreatedId = created.id;
          firstReceipt = false;
        }
      } else {
        const photosPayload = autoSettlement
          ? await Promise.all(
              converted.map(async (blob) => [
                { base64: await blobToBase64(blob), mimeType: blob.type || "image/jpeg" },
              ])
            )
          : undefined;

        const tripLocationsAll = tripStops.map((s) => s.location);
        const tripLocationsNonDeparture = tripStops.filter((s) => s.type !== "DEPARTURE").map((s) => s.location);
        const lodgingAlreadyAcceptedInTrip = category === "LODGING" ? sumAcceptedLodging(receipts) : undefined;

        const analyzeRes = await fetch("/api/receipts/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            transportMode: transportMode ?? null,
            tripStartDate,
            tripEndDate,
            tripLocationsAll,
            tripLocationsNonDeparture,
            lodgingAlreadyAcceptedInTrip,
            autoSettlement,
            manualAmount: needsManualAmount ? parsedAmount : null,
            manualDatetime: needsManualDatetime ? manualDatetime : null,
            photos: photosPayload,
          }),
        });
        const analyzeData = await analyzeRes.json().catch(() => null);
        if (!analyzeRes.ok || !analyzeData?.analysis) {
          setError(
            analyzeData?.error ??
              (analyzeRes.status === 504
                ? "처리 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."
                : "업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.")
          );
          setUploading(false);
          return;
        }
        const created = await saveReceipt(analyzeData.analysis, converted);
        lastCreatedId = created.id;
      }

      setSelectedId(lastCreatedId);
      setQueue([]);
      setManualAmount("");
      setManualDatetime("");
      setRouteSelections([]);
      setUploading(false);
      onChange?.();
    } catch (err) {
      setError(describeUploadError(err));
      setUploading(false);
    }
  }

  async function reanalyzeReceipt(id: string) {
    if (!autoSettlement) return; // 수동입력 모드는 재분석 대상이 없다(버튼 자체가 안 뜨지만 방어적으로).
    const receipt = receipts.find((r) => r.id === id);
    if (!receipt) return;
    setReanalyzingId(id);
    setError(null);
    try {
      const photosPayload = await Promise.all(
        receipt.images.map(async (img) => {
          const stored = await getReceiptImageBytes(img.id, "full");
          if (!stored) throw new Error("저장된 사진을 찾을 수 없습니다.");
          return [{ base64: await blobToBase64(new Blob([stored.bytes])), mimeType: stored.mimeType }];
        })
      );
      const tripLocationsAll = tripStops.map((s) => s.location);
      const tripLocationsNonDeparture = tripStops.filter((s) => s.type !== "DEPARTURE").map((s) => s.location);
      const lodgingAlreadyAcceptedInTrip =
        category === "LODGING" ? sumAcceptedLodging(receipts, id) : undefined;

      const res = await fetch("/api/receipts/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          transportMode: transportMode ?? null,
          tripStartDate,
          tripEndDate,
          tripLocationsAll,
          tripLocationsNonDeparture,
          lodgingAlreadyAcceptedInTrip,
          autoSettlement: true,
          photos: photosPayload,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.analysis) {
        const { analysis } = data;
        await updateReceipt(id, {
          ocrStatus: analysis.ocrStatus,
          ocrText: analysis.ocrText,
          ocrAmountGuess: analysis.ocrAmountGuess,
          ocrDateGuess: analysis.ocrDateGuess,
          ocrMerchantGuess: analysis.ocrMerchantGuess,
          ocrModel: analysis.ocrModel,
          verdictStatus: analysis.verdict.status,
          verdictAmount: analysis.verdict.acceptedAmount,
          verdictMessage: analysis.verdict.message,
          verdictFailedCheck: analysis.verdict.failedCheckId,
          verdictRegulationRef: analysis.verdict.regulationRef,
        });
        onChange?.();
      } else {
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

  /**
   * "네이버지도 인증하기" - 현재 위치의 지도 스냅샷을 받아 여느 현장사진과 동일한 방식으로
   * 저장한다(카메라로 찍은 사진과 같은 saveReceipt 경로를 안 쓰는 건, 이 흐름엔 큐/파일 변환
   * 단계가 아예 없어 그대로 재사용하기보다 직접 만드는 편이 더 단순해서다).
   */
  async function verifyLocation() {
    setVerifyingLocation(true);
    setError(null);
    try {
      const coords = await getCurrentCoords();
      if (!coords) {
        setError("위치를 확인할 수 없습니다. 위치 권한을 허용했는지 확인한 뒤 다시 시도해 주세요.");
        return;
      }
      const { address, imageBlob } = await fetchLocationSnapshot(coords.lat, coords.lng);
      // "날짜 시간 주소" 순서로 한 줄에 합쳐 보여준다(2026-08-11, 사용자 요청) - 화면(그리드
      // 캡션/상세보기)과 PDF가 이 한 값을 그대로 가져다 쓰므로 별도로 맞출 필요가 없다.
      const verifiedAt = formatDateTime(new Date());
      const verdictMessage = address ? `${verifiedAt} ${address}` : `${verifiedAt} 네이버지도 위치 인증`;
      const created = await createReceipt({
        tripId,
        category: "FIELD",
        transportMode: null,
        ocrStatus: "PENDING",
        verdictStatus: "APPROVED",
        verdictAmount: null,
        verdictMessage,
        verdictFailedCheck: null,
        verdictRegulationRef: null,
      });
      const fullBytes = await imageBlob.arrayBuffer();
      const thumbBlob = await toThumbnailJpeg(imageBlob).catch(() => null);
      const thumbBytes = thumbBlob ? await thumbBlob.arrayBuffer() : null;
      await addReceiptImage({
        receiptId: created.id,
        order: 0,
        mimeType: imageBlob.type || "image/jpeg",
        fullBytes,
        thumbBytes,
      });
      onChange?.();
    } catch (err) {
      console.error("네이버지도 인증 실패:", err);
      setError(err instanceof Error ? err.message : "위치 인증에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setVerifyingLocation(false);
    }
  }

  async function removeReceipt(id: string) {
    if (selectedId === id) setSelectedId(null);
    try {
      await deleteReceipt(id);
      onChange?.();
    } catch {
      setError("영수증을 삭제하지 못했습니다.");
    }
  }

  const selectedReceipt = receipts.find((r) => r.id === selectedId) ?? null;

  const hint = needsRouteSelection
    ? "정액 지급 대상입니다. 인트라넷 간편입력을 위해 구간을 선택해주세요."
    : flatRate
    ? "정액정산 대상입니다. 별도 금액 확인 없이 사진 첨부만으로 인정됩니다."
    : !autoSettlement
    ? category === "FIELD"
      ? "증빙용 사진입니다. 첨부하면 제출 처리됩니다."
      : "사용자 입력정보에 따라 검토합니다"
    : category === "FIELD"
    ? "판정 대상이 아닌 증빙용 사진입니다. 첨부하면 바로 인정 처리됩니다."
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

      {/* 영수증 개별이 아니라 이 출장의 숙박 합계 전체를 기준으로 딱 한 번만 보여준다 - 사내
          시스템도 건별이 아니라 "출장 전체 숙박비 ÷ 전체 박수"만 본다(2026-08-10, 사용자 확인). */}
      {lodgingExceedsIntranetThreshold && (
        <p className="rounded-2xl bg-amber-500/10 p-3 text-[13px] font-medium text-amber-600 dark:text-amber-400">
          인트라넷 내 숙박비 여비정산을 작성해주세요
        </p>
      )}

      {queue.length === 0 ? (
        <div>
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
          {isBreakfast && (
            <p className="mt-2 text-left text-[12px] text-neutral-400">
              출장 첫날 조식비를 신청하는 경우, 사진촬영 또는 증빙사진을 올려주세요
            </p>
          )}
          {category === "FIELD" && naverMapEnabled && (
            <button
              type="button"
              onClick={verifyLocation}
              disabled={verifyingLocation}
              // 네이버 브랜드 컬러(#03C75A)로 눈에 띄게 - 다른 두 버튼(갤러리/카메라)과 구분되는
              // 별개 서비스(외부 API 연동)라는 걸 색으로도 드러낸다(2026-08-11).
              className="shadow-glow mt-3 flex w-full items-center justify-center gap-2 rounded-[20px] bg-[#03C75A] py-4 text-[15px] font-semibold text-white active:scale-[0.98] disabled:opacity-50"
            >
              <IconMap />
              {verifyingLocation ? "위치 확인 중..." : "네이버지도 인증하기"}
            </button>
          )}
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
                ) : isHeic(resolveContentType(q.file), q.file.name) ? (
                  // 대부분의 브라우저(사파리 제외)는 <img>로 HEIC를 못 그린다 - 깨진 이미지
                  // 대신 등록 시 변환될 거라는 걸 알 수 있게 아이콘으로 대체한다(2026-08-11).
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1">
                    <IconPhoto className="size-6 text-neutral-400" />
                    <span className="max-w-full truncate text-[9px] text-neutral-500">HEIC</span>
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
          {showRouteInQueue && (
            <div className="mt-3">
              <TransportRoutePicker
                transportMode={transportMode as "RAIL" | "PRIVATE_CAR" | "BUS"}
                grade={grade ?? "JUNIOR"}
                value={routeSelections}
                onChange={setRouteSelections}
                initialFrom={routeDefaultFrom}
                initialTo={routeDefaultTo}
              />
            </div>
          )}
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
          {!showRouteInline && hint && <p className="mt-3 text-[12px] text-neutral-400">{hint}</p>}
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

      {/* 버스는 사진을 아직 안 골랐어도 구간 검색창이 바로 보이게 한다 - 예전엔 사진을 먼저
          담아야만 구간 입력이 나타나 순서가 어색했다(2026-08-10 실사용 피드백). */}
      {showRouteInline && (
        <div className="shadow-soft rounded-[24px] border border-black/5 bg-white/80 p-4 dark:border-white/10 dark:bg-white/[0.04]">
          <TransportRoutePicker
            transportMode={transportMode as "RAIL" | "PRIVATE_CAR" | "BUS"}
            grade={grade ?? "JUNIOR"}
            value={routeSelections}
            onChange={setRouteSelections}
            initialFrom={routeDefaultFrom}
            initialTo={routeDefaultTo}
          />
          {hint && <p className="mt-3 text-[12px] text-neutral-400">{hint}</p>}
          {/* 사진을 아직 안 골랐어도(버스표를 따로 안 챙긴 경우 등) 구간만으로 등록을 확정지을
              수 있게 한다 - 사진이 있으면 아래 대기열 카드의 "사진 N장 등록" 버튼을 쓰면 된다. */}
          {routeSelections.length > 0 && queue.length === 0 && (
            <button
              type="button"
              onClick={confirmUpload}
              disabled={uploading}
              className="shadow-glow mt-3 w-full rounded-full bg-brand py-3 text-[15px] font-semibold text-white disabled:opacity-50"
            >
              {uploading ? "처리 중..." : "구간 등록"}
            </button>
          )}
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
                  <ReceiptImg
                    imageId={r.images[0].id}
                    variant="thumb"
                    alt="등록된 영수증"
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
                  className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${verdictBadgeClass(r, autoSettlement)}`}
                >
                  {verdictDisplayLabel(r.verdictStatus, autoSettlement, r.category, r.transportMode)}
                </span>
                {r.verdictAmount !== null ? (
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[11px] font-medium text-white">
                    {r.verdictAmount.toLocaleString("ko-KR")}원
                  </span>
                ) : (
                  // 현장사진 중 "네이버지도 인증하기"로 만든 항목은 amount가 없는 대신 날짜/시간/
                  // 주소가 verdictMessage에 들어있다 - 그리드에서도 바로 보이게 캡션으로 보여준다
                  // (2026-08-11, 탭해서 상세보기까지 들어가야만 보이던 걸 개선).
                  r.category === "FIELD" &&
                  r.verdictMessage && (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-[10px] font-medium text-white">
                      {r.verdictMessage}
                    </span>
                  )
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
                autoSettlement={autoSettlement}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
