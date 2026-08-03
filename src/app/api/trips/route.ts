import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type StopInput = {
  type: "DEPARTURE" | "STOPOVER" | "ARRIVAL";
  location: string;
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const stops: StopInput[] = body.stops ?? [];
  const { startDate, endDate, ownerEmail } = body;

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof ownerEmail !== "string" || !EMAIL_PATTERN.test(ownerEmail.trim())) {
    return NextResponse.json({ error: "정산 결과를 받을 이메일 주소를 올바르게 입력해 주세요." }, { status: 400 });
  }
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "출장기간(시작일/종료일)을 입력해 주세요." }, { status: 400 });
  }
  if (new Date(endDate) < new Date(startDate)) {
    return NextResponse.json({ error: "종료일이 시작일보다 빠를 수 없습니다." }, { status: 400 });
  }
  if (stops.length < 2) {
    return NextResponse.json(
      { error: "출발지와 목적지 정보가 필요합니다." },
      { status: 400 }
    );
  }
  for (const stop of stops) {
    if (!stop.location?.trim()) {
      return NextResponse.json(
        { error: "모든 경로 항목에 장소를 입력해 주세요." },
        { status: 400 }
      );
    }
  }

  const trip = await prisma.trip.create({
    data: {
      ownerEmail: ownerEmail.trim(),
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      stops: {
        create: stops.map((s, idx) => ({
          type: s.type,
          location: s.location.trim(),
          order: idx,
        })),
      },
    },
    include: { stops: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ trip });
}

export async function GET() {
  const trips = await prisma.trip.findMany({
    orderBy: { createdAt: "desc" },
    include: { stops: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ trips });
}
