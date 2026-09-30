import { NextRequest, NextResponse } from "next/server";
import { listMonthlyReports, listWeeklyLogs, saveMonthlyReport } from "@/lib/store";
import { normalizeMonthly } from "@/lib/monthlyReport";

export const dynamic = "force-dynamic";

// 잠금 없음 — 업무일지·주간보고와 같은 결정 (docs/adr/0003)

// 월간 보고서 전체 + 표지 초안을 만들 주간 보고
export async function GET() {
  const [reports, weeklies] = await Promise.all([listMonthlyReports(), listWeeklyLogs()]);
  return NextResponse.json({ reports, weeklies });
}

// 저장 — 본문 { report }. 같은 보고월은 덮어쓴다
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const report = normalizeMonthly(b?.report);
  if (!report) return NextResponse.json({ error: "보고월 형식이 잘못됐거나 내용이 너무 큽니다." }, { status: 400 });
  await saveMonthlyReport(report);
  return NextResponse.json({ saved: report.month });
}