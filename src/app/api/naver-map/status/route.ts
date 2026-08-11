import { NextResponse } from "next/server";
import { isNaverMapConfigured } from "@/lib/naverMapConfig";

/**
 * /api/email-status와 같은 이유(2026-08-10) - process.env는 서버에서만 채워지므로, "use client"
 * 컴포넌트(ReceiptManager)가 버튼을 보여줄지 판단하려면 서버에서 판정한 결과를 fetch로 받아야 한다.
 */
export async function GET() {
  return NextResponse.json({ enabled: isNaverMapConfigured() });
}
