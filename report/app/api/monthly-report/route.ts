import { NextRequest, NextResponse } from "next/server";
import { listMonthlyReports, listWeeklyLogs, updateMonthlyReports } from "@/lib/store";
import { merge3 } from "@/lib/merge";
import { normalizeMonthly } from "@/lib/monthlyReport";

export const dynamic = "force-dynamic";

// 잠금 없음 — 업무일지·주간보고와 같은 결정 (docs/adr/0003)

// 월간 보고서 전체 + 표지 초안을 만들 주간 보고
export async function GET() {
  const [reports, weeklies] = await Promise.all([listMonthlyReports(), listWeeklyLogs()]);
  return NextResponse.json({ reports, weeklies });
}

// 저장 — 본문 { report, base? }. base(편집을 시작할 때의 보고서)가 있으면 「내가 고친 칸만」 합친다 — 동시 편집 보호 (lib/merge.ts)
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const report = normalizeMonthly(b?.report);
  if (!report) return NextResponse.json({ error: "보고월 형식이 잘못됐거나 내용이 너무 큽니다." }, { status: 400 });
  const base = b?.base ? normalizeMonthly({ ...b.base, month: report.month }) ?? undefined : undefined;
  const out = await updateMonthlyReports((all) => {
    const cur = all.find((r) => r.month === report.month);
    const m = b?.base ? merge3(cur, base, report) : { value: report, conflicts: [], others: 0 };
    const merged = normalizeMonthly(m.value) ?? report;
    return {
      all: [...all.filter((r) => r.month !== report.month), merged],
      result: { report: merged, conflicts: [...new Set(m.conflicts.map(monthLabel))], others: m.others },
    };
  });
  return NextResponse.json({ saved: report.month, ...out });
}

// 경로 → 화면 탭 이름 ("facility.3.status" → "시설실적")
const MONTH_LABELS: Record<string, string> = {
  coverImage: "표지 사진", cover: "표지", education: "교육", orgImage: "조직도", costNotes: "증감분석", energy: "에너지 사용현황",
  tenantsImage: "입주사 현황", contacts: "고객사 연락처", facility: "시설실적", photos: "작업 사진", nextPlan: "차월계획",
  staff: "근무자", holidays: "공휴일", overrides: "근무표", scheduleNote: "근무표 비고",
};
function monthLabel(p: string): string {
  const [a, b] = p.split(".");
  return a === "cover" || a === "photos" ? `${MONTH_LABELS[a]}(${b})` : MONTH_LABELS[a] ?? a;
}