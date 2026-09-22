import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { listPungReports, savePungReport } from "@/lib/store";
import { emptyPungReport } from "@/lib/pungsuhae";

export const dynamic = "force-dynamic";

// 목록 (일별, 최신순)
export async function GET() {
  const reports = await listPungReports();
  return NextResponse.json(reports);
}

// 새 보고서 생성 (오늘 날짜 + 양식 기본값)
export async function POST() {
  const report = await savePungReport(emptyPungReport(randomUUID()));
  return NextResponse.json(report, { status: 201 });
}
