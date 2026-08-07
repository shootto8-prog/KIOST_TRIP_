import type { Receipt, ReceiptImage } from "@prisma/client";

export type ReceiptItem = {
  id: string;
  category: "BREAKFAST" | "TRANSPORT" | "LODGING" | "FIELD";
  // Blob 원본 URL(path/thumbPath)은 여기 포함하지 않는다 - 화면은 항상
  // /api/receipts/image/{id}(본인 확인 프록시)로만 사진을 받아온다. 원본 URL을 API 응답에
  // 실어 보내면, 스토어가 지금 public이라 그 URL만으로 로그인 없이 영구 열람이 가능해진다.
  // (2026-08-07)
  images: { id: string; order: number }[];
  createdAt: string;
  transportMode?: "SHIP" | "AIR" | "RAIL" | "PRIVATE_CAR" | "BUS" | null;
  ocrStatus: "PENDING" | "DONE" | "FAILED";
  ocrText: string | null;
  ocrAmountGuess: number | null;
  ocrDateGuess: string | null;
  ocrMerchantGuess: string | null;
  ocrModel: string | null;
  verdictStatus: "PENDING" | "APPROVED" | "PARTIAL" | "REJECTED" | "SUBMITTED";
  verdictAmount: number | null;
  verdictMessage: string | null;
  verdictFailedCheck: string | null;
  verdictRegulationRef: string | null;
};

export function toReceiptItem(r: Receipt & { images: ReceiptImage[] }): ReceiptItem {
  return {
    id: r.id,
    category: r.category,
    images: r.images
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((img) => ({ id: img.id, order: img.order })),
    createdAt: r.createdAt.toISOString(),
    transportMode: r.transportMode,
    ocrStatus: r.ocrStatus,
    ocrText: r.ocrText,
    ocrAmountGuess: r.ocrAmountGuess,
    ocrDateGuess: r.ocrDateGuess ? r.ocrDateGuess.toISOString() : null,
    ocrMerchantGuess: r.ocrMerchantGuess,
    ocrModel: r.ocrModel,
    verdictStatus: r.verdictStatus,
    verdictAmount: r.verdictAmount,
    verdictMessage: r.verdictMessage,
    verdictFailedCheck: r.verdictFailedCheck,
    verdictRegulationRef: r.verdictRegulationRef,
  };
}
