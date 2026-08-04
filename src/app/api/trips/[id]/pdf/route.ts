import { NextResponse } from "next/server";
import { generateTripPdf } from "@/lib/generatePdf";
import { prisma } from "@/lib/prisma";
import { assertTripOwner } from "@/lib/ownerGuard";

// 사진 여러 장을 각각 내려받아 리사이즈한 뒤 PDF로 조립하므로 시간이 걸릴 수 있다.
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 주소만 알면 남의 정산서(사진·금액 포함)를 통째로 받아갈 수 있던 구멍을 막는다.
  const trip = await prisma.trip.findUnique({ where: { id }, select: { ownerEmail: true } });
  if (!trip) {
    return NextResponse.json({ error: "출장 정보를 찾을 수 없습니다." }, { status: 404 });
  }
  const ownerError = await assertTripOwner(trip.ownerEmail);
  if (ownerError) {
    return NextResponse.json({ error: ownerError.error }, { status: ownerError.status });
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateTripPdf(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF 생성에 실패했습니다.";
    const status = message.includes("찾을 수 없습니다") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="trip-${id}-settlement.pdf"`,
    },
  });
}
