import { NextResponse } from "next/server";
import { generateTripPdf } from "@/lib/generatePdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateTripPdf(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF 생성에 실패했습니다.";
    const status = message.includes("찾을 수 없습니다") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="trip-${id}-settlement.pdf"`,
    },
  });
}
