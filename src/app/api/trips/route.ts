import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseYmd, INVALID_DATE_MESSAGE } from "@/lib/ymdDate";

type StopInput = {
  type: "DEPARTURE" | "STOPOVER" | "ARRIVAL";
  location: string;
};

export async function POST(req: NextRequest) {
  // 다른 라우트들과 마찬가지로 본문 파싱 실패는 500이 아니라 400으로 돌려준다.
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const stops: StopInput[] = Array.isArray(body.stops) ? body.stops : [];
  const { startDate, endDate, ownerEmail } = body;

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof ownerEmail !== "string" || !EMAIL_PATTERN.test(ownerEmail.trim())) {
    return NextResponse.json({ error: "정산 결과를 받을 이메일 주소를 올바르게 입력해 주세요." }, { status: 400 });
  }
  if (!startDate || !endDate) {
    return NextResponse.json({ error: "출장기간(시작일/종료일)을 입력해 주세요." }, { status: 400 });
  }
  // "2026-13-01" 같은 값은 예전에 Invalid Date로 Prisma까지 흘러가 500이 됐다.
  const parsedStart = parseYmd(startDate);
  const parsedEnd = parseYmd(endDate);
  if (!parsedStart || !parsedEnd) {
    return NextResponse.json({ error: INVALID_DATE_MESSAGE }, { status: 400 });
  }
  if (parsedEnd < parsedStart) {
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
      startDate: parsedStart,
      endDate: parsedEnd,
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

// GET /api/trips는 삭제했다. 앱 어디에서도 호출하지 않는데(홈 화면은 서버 컴포넌트에서 Prisma를
// 직접 쓴다) 인증 없이 전 사용자의 출장 목록과 실제 이메일 주소를 그대로 반환하고 있었다.
// (2026-08-04 결정사항 9)
