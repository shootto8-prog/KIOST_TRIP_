import type { Receipt, ReceiptImage } from "@prisma/client";

export type ReceiptItem = {
  id: string;
  category: "BREAKFAST" | "TRANSPORT" | "LODGING" | "FIELD";
  images: { id: string; path: string; order: number }[];
  createdAt: string;
  transportMode?: "SHIP" | "AIR" | "RAIL" | "PRIVATE_CAR" | "BUS" | null;
  seatClass?: "NORMAL" | "RESTRICTED" | null;
  ocrStatus: "PENDING" | "DONE" | "FAILED";
  ocrText: string | null;
  ocrAmountGuess: number | null;
  ocrDateGuess: string | null;
  ocrMerchantGuess: string | null;
  ocrModel: string | null;
  verdictStatus: "PENDING" | "APPROVED" | "PARTIAL" | "REJECTED";
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
      .map((img) => ({ id: img.id, path: img.path, order: img.order })),
    createdAt: r.createdAt.toISOString(),
    transportMode: r.transportMode,
    seatClass: r.seatClass,
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
