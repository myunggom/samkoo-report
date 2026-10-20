import { NextRequest, NextResponse } from "next/server";
import { getUtility, updateUtility } from "@/lib/store";
import { normalizeFixes, normalizeMonth, normalizeTemplate } from "@/lib/utility";
import type { UtilityDoc } from "@/lib/utility";

export const dynamic = "force-dynamic";

// 수도광열비 — 엑셀 읽기·채우기는 브라우저에서 하고(lib/utilityXlsx.ts), 여기는 입력값·파일 위치만 저장한다.
export async function GET() {
  return NextResponse.json(await getUtility());
}

// 본문 { op, ... } — month: 그 달 입력값·검침자료 / fixes: 보정표 / template: 다음 달에 쓸 회입분 양식
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const op = b?.op;
  const month = op === "month" ? normalizeMonth(b.month, b.data) : null;
  const fixes = op === "fixes" ? normalizeFixes(b.fixes) : null;
  const tpl = op === "template" ? normalizeTemplate(b.kind, b.template) : null;
  if (!month && !fixes && !tpl) return NextResponse.json({ error: "입력이 올바르지 않습니다." }, { status: 400 });
  const doc = await updateUtility((cur): { doc: UtilityDoc; result: UtilityDoc } => {
    const d: UtilityDoc = { fixes: cur.fixes, templates: { ...cur.templates }, months: { ...cur.months } };
    if (month) d.months[b.month] = month;
    if (fixes) d.fixes = fixes;
    if (tpl) d.templates[tpl.kind] = tpl.t;
    return { doc: d, result: d };
  });
  return NextResponse.json(doc);
}
