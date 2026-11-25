import { NextRequest, NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { addHvacVersion, listHvacVersions } from "@/lib/hvacStore";
import { AHU_UNITS, cleanSetting, isDate } from "@/lib/hvac";

export const dynamic = "force-dynamic";

// 보기는 누구나, 고치기는 기계과장(비밀번호 HVAC_EDIT_PASSWORD).
function pwOk(given: unknown): boolean {
  const pw = process.env.HVAC_EDIT_PASSWORD || "";
  if (!pw || typeof given !== "string") return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(pw).digest();
  return timingSafeEqual(a, b);
}

export async function GET() {
  try {
    return NextResponse.json({ versions: await listHvacVersions() });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message || e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (b.check === true) {
    // 편집 화면을 열 때 비밀번호만 먼저 확인
    return pwOk(b.password)
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "비밀번호가 맞지 않습니다." }, { status: 401 });
  }
  if (!pwOk(b.password)) return NextResponse.json({ error: "비밀번호가 맞지 않습니다." }, { status: 401 });
  if (!isDate(b.effectiveFrom)) return NextResponse.json({ error: "적용일을 골라 주세요." }, { status: 400 });
  const by = String(b.by || "").trim().slice(0, 30);
  const reason = String(b.reason || "").trim().slice(0, 300);
  if (!by) return NextResponse.json({ error: "수정자 이름을 적어 주세요." }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "변경 사유를 적어 주세요." }, { status: 400 });
  const src = (b.settings && typeof b.settings === "object" ? b.settings : {}) as Record<string, unknown>;
  const settings = Object.fromEntries(AHU_UNITS.map((u) => [u.id, cleanSetting(src[u.id])]));
  try {
    const v = await addHvacVersion({ effectiveFrom: b.effectiveFrom, by, reason, settings });
    return NextResponse.json(v, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "저장하지 못했습니다 : " + String((e as Error).message || e) }, { status: 500 });
  }
}
