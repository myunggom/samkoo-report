import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { listGenReports, saveGenReport } from "@/lib/store";
import { emptyGenReport, REPORT_KINDS, type ReportKind } from "@/lib/reports";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listGenReports());
}

// 새 보고서 생성 — { kind }
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const kind = (REPORT_KINDS as string[]).includes(b.kind) ? (b.kind as ReportKind) : "completion";
  const report = await saveGenReport(emptyGenReport(randomUUID(), kind));
  return NextResponse.json(report, { status: 201 });
}
