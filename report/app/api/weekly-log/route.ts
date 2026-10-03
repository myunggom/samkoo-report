import { NextRequest, NextResponse } from "next/server";
import { listDailyLogs, listWeeklyLogs, updateWeeklyLogs } from "@/lib/store";
import { merge3 } from "@/lib/merge";
import { normalizeWeekly } from "@/lib/weeklyLog";
import type { WeeklyLog } from "@/lib/weeklyLog";

export const dynamic = "force-dynamic";

// 잠금 없음 — 업무일지 탭과 같은 결정 (docs/adr/0003)

// 주간 보고 전체 + 초안을 만들 일일 업무일지 전체
export async function GET() {
  const [weeklies, dailies] = await Promise.all([listWeeklyLogs(), listDailyLogs()]);
  return NextResponse.json({ weeklies, dailies });
}

// 저장 — 본문 { weeklies: [...], bases?: [...] }.
//   bases 가 있으면(화면에서 1건 저장) 편집을 시작할 때의 보고와 비교해 「내가 고친 칸만」 합친다 — 동시 편집 보호 (lib/merge.ts).
//   bases 가 없으면(일괄 가져오기) 같은 보고일을 통째로 덮어쓴다.
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const input = Array.isArray(b?.weeklies) ? b.weeklies : null;
  if (!input || input.length > 200) return NextResponse.json({ error: "weeklies 배열(최대 200건)이 필요합니다." }, { status: 400 });
  const items = input.map(normalizeWeekly).filter((w: WeeklyLog | null): w is WeeklyLog => w !== null);
  if (items.length !== input.length) return NextResponse.json({ error: "날짜·기간 형식이 잘못된 항목이 있습니다." }, { status: 400 });
  const bases: (WeeklyLog | undefined)[] | null = Array.isArray(b?.bases)
    ? items.map((w: WeeklyLog, i: number) => normalizeWeekly({ ...b.bases[i], date: w.date }) ?? undefined)
    : null;
  const out = await updateWeeklyLogs((all) => {
    const byDate = new Map(all.map((w) => [w.date, w]));
    const saved: WeeklyLog[] = [];
    const conflicts: string[] = [];
    let others = 0;
    items.forEach((mine: WeeklyLog, i: number) => {
      const m = bases ? merge3(byDate.get(mine.date), bases[i], mine) : { value: mine, conflicts: [], others: 0 };
      const w = normalizeWeekly(m.value) ?? mine;
      byDate.set(w.date, w);
      saved.push(w);
      conflicts.push(...m.conflicts.map(weekLabel));
      others += m.others;
    });
    return { all: [...byDate.values()], result: { saved, conflicts: [...new Set(conflicts)], others } };
  });
  return NextResponse.json({ saved: out.saved.length, weeklies: out.saved, conflicts: out.conflicts, others: out.others });
}

// "work.전기.done" → "전기 실적"
function weekLabel(p: string): string {
  const [a, b, c] = p.split(".");
  if (a === "work") return `${b} ${c === "plan" ? "계획" : "실적"}`;
  return a.startsWith("this") ? "이번주 기간" : a.startsWith("next") ? "다음주 기간" : a;
}