import { NextRequest, NextResponse } from "next/server";
import { listDailyLogs, updateDailyLogs } from "@/lib/store";
import { conflictLabel, mergeLog, normalizeLog } from "@/lib/dailyLog";
import type { DailyLog } from "@/lib/dailyLog";

export const dynamic = "force-dynamic";

// 잠금 없음 — 사용자 결정(2026-09-29): 일일 기록·문제 관리 탭처럼 공개로 운영

// 전체 목록 — 전일검침·월 누계 계산에 이전 기록이 모두 필요하다 (1년 ~250건이라 가볍다)
export async function GET() {
  return NextResponse.json(await listDailyLogs());
}

// 저장 — 본문 { logs: [...], bases?: [...] }.
//   bases 가 있으면(화면에서 1건 저장) 편집을 시작할 때의 일지와 비교해 「내가 고친 칸만」 합친다 — 동시 편집 보호.
//   bases 가 없으면(일괄 가져오기) 같은 날짜를 통째로 덮어쓴다.
// 응답의 logs 는 합쳐진 결과, conflicts 는 다른 사람과 같은 칸을 동시에 고쳐 내 값으로 덮은 칸 이름.
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const input = Array.isArray(b?.logs) ? b.logs : null;
  if (!input || input.length > 400) return NextResponse.json({ error: "logs 배열(최대 400건)이 필요합니다." }, { status: 400 });
  const logs = input.map(normalizeLog).filter((l: DailyLog | null): l is DailyLog => l !== null);
  if (logs.length !== input.length) return NextResponse.json({ error: "날짜 형식이 잘못된 항목이 있습니다." }, { status: 400 });
  const bases: (DailyLog | undefined)[] | null = Array.isArray(b?.bases)
    ? logs.map((_: DailyLog, i: number) => normalizeLog({ ...b.bases[i], date: logs[i].date }) ?? undefined)
    : null;

  const out = await updateDailyLogs((all) => {
    const byDate = new Map(all.map((l) => [l.date, l]));
    const saved: DailyLog[] = [];
    const conflicts: string[] = [];
    let others = 0;
    logs.forEach((mine: DailyLog, i: number) => {
      const m = bases ? mergeLog(byDate.get(mine.date), bases[i], mine) : { log: mine, conflicts: [], others: 0 };
      others += m.others;
      byDate.set(mine.date, m.log);
      saved.push(m.log);
      conflicts.push(...m.conflicts.map(conflictLabel));
    });
    return { all: [...byDate.values()], result: { saved, conflicts, others } };
  });
  return NextResponse.json({ saved: out.saved.length, logs: out.saved, conflicts: out.conflicts, others: out.others });
}
