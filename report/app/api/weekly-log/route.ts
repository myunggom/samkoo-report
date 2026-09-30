import { NextRequest, NextResponse } from "next/server";
import { listDailyLogs, listWeeklyLogs, saveWeeklyLogs } from "@/lib/store";
import { normalizeWeekly } from "@/lib/weeklyLog";
import type { WeeklyLog } from "@/lib/weeklyLog";

export const dynamic = "force-dynamic";

// 잠금 없음 — 업무일지 탭과 같은 결정 (docs/adr/0003)

// 주간 보고 전체 + 초안을 만들 일일 업무일지 전체
export async function GET() {
  const [weeklies, dailies] = await Promise.all([listWeeklyLogs(), listDailyLogs()]);
  return NextResponse.json({ weeklies, dailies });
}

// 저장 — 본문 { weeklies: [...] }. 같은 보고일은 덮어쓴다 (1건 저장·일괄 가져오기 공용)
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const input = Array.isArray(b?.weeklies) ? b.weeklies : null;
  if (!input || input.length > 200) return NextResponse.json({ error: "weeklies 배열(최대 200건)이 필요합니다." }, { status: 400 });
  const items = input.map(normalizeWeekly).filter((w: WeeklyLog | null): w is WeeklyLog => w !== null);
  if (items.length !== input.length) return NextResponse.json({ error: "날짜·기간 형식이 잘못된 항목이 있습니다." }, { status: 400 });
  await saveWeeklyLogs(items);
  return NextResponse.json({ saved: items.length });
}