import { NextRequest, NextResponse } from "next/server";
import { listDailyLogs, saveDailyLogs } from "@/lib/store";
import { canUseDailyLog } from "@/lib/weeklyAuth";
import { normalizeLog } from "@/lib/dailyLog";
import type { DailyLog } from "@/lib/dailyLog";

export const dynamic = "force-dynamic";

// 전체 목록 — 전일검침·월 누계 계산에 이전 기록이 모두 필요하다 (1년 ~250건이라 가볍다)
export async function GET(req: NextRequest) {
  if (!canUseDailyLog(req.cookies)) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  return NextResponse.json(await listDailyLogs());
}

// 저장 — 본문 { logs: [...] }. 같은 날짜는 덮어쓴다 (1건 저장·일괄 가져오기 공용)
export async function PUT(req: NextRequest) {
  if (!canUseDailyLog(req.cookies)) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const input = Array.isArray(b?.logs) ? b.logs : null;
  if (!input || input.length > 400) return NextResponse.json({ error: "logs 배열(최대 400건)이 필요합니다." }, { status: 400 });
  const logs = input.map(normalizeLog).filter((l: DailyLog | null): l is DailyLog => l !== null);
  if (logs.length !== input.length) return NextResponse.json({ error: "날짜 형식이 잘못된 항목이 있습니다." }, { status: 400 });
  await saveDailyLogs(logs);
  return NextResponse.json({ saved: logs.length });
}
