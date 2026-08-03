import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rm } from "fs/promises";
import path from "path";

type StopInput = {
  type: "DEPARTURE" | "STOPOVER" | "ARRIVAL";
  location: string;
};

/**
 * 출장 상태(진행중/종료) 변경, 그리고 출장 경로(연장/단축 등) 수정을 함께 처리한다.
 * 경로 수정은 개별 정거장을 diff하지 않고, 기존 정거장을 전부 지우고 새로 받은 목록으로
 * 다시 만드는 방식(전체 교체)을 쓴다 - 정거장은 다른 테이블에서 참조되지 않아 안전하고,
 * 추가/삭제/순서변경을 한 번에 다루기 훨씬 단순하다.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const trip = await prisma.trip.findUnique({ where: { id } });
  if (!trip) {
    return NextResponse.json({ error: "출장 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.ownerEmail !== undefined) {
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof body.ownerEmail !== "string" || !EMAIL_PATTERN.test(body.ownerEmail.trim())) {
      return NextResponse.json({ error: "정산 결과를 받을 이메일 주소를 올바르게 입력해 주세요." }, { status: 400 });
    }
    await prisma.trip.update({ where: { id }, data: { ownerEmail: body.ownerEmail.trim() } });
  }

  if (body.status !== undefined) {
    if (body.status !== "ACTIVE" && body.status !== "COMPLETED") {
      return NextResponse.json({ error: "유효하지 않은 상태입니다." }, { status: 400 });
    }
    await prisma.trip.update({ where: { id }, data: { status: body.status } });
  }

  if (body.startDate !== undefined || body.endDate !== undefined) {
    const startDate = body.startDate ? new Date(body.startDate) : trip.startDate;
    const endDate = body.endDate ? new Date(body.endDate) : trip.endDate;
    if (endDate < startDate) {
      return NextResponse.json({ error: "종료일이 시작일보다 빠를 수 없습니다." }, { status: 400 });
    }
    await prisma.trip.update({ where: { id }, data: { startDate, endDate } });
  }

  if (body.stops !== undefined) {
    const stops: StopInput[] = body.stops;
    if (!Array.isArray(stops) || stops.length < 2) {
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

    await prisma.$transaction([
      prisma.tripStop.deleteMany({ where: { tripId: id } }),
      prisma.tripStop.createMany({
        data: stops.map((s, idx) => ({
          tripId: id,
          type: s.type,
          location: s.location.trim(),
          order: idx,
        })),
      }),
    ]);
  }

  const updated = await prisma.trip.findUnique({
    where: { id },
    include: { stops: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ trip: updated });
}

/** 출장 삭제 - 정거장/영수증 DB 레코드는 cascade로 같이 지워지고, 업로드된 영수증 이미지 파일도 정리한다. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const trip = await prisma.trip.findUnique({ where: { id } });
  if (!trip) {
    return NextResponse.json({ error: "출장 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.trip.delete({ where: { id } });

  const uploadDir = path.join(process.cwd(), "public", "uploads", id);
  await rm(uploadDir, { recursive: true, force: true }).catch(() => {});

  return NextResponse.json({ ok: true });
}
