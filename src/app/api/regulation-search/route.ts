import { NextRequest, NextResponse } from "next/server";
import { searchRegulation } from "@/lib/regulationSearch";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const topKRaw = searchParams.get("topK");
  const topK = topKRaw ? Math.max(1, Math.min(10, parseInt(topKRaw, 10) || 3)) : 3;

  if (!q || !q.trim()) {
    return NextResponse.json({ error: "q(질의) 파라미터가 필요합니다." }, { status: 400 });
  }

  const results = searchRegulation(q, topK);
  return NextResponse.json({ query: q, results });
}
