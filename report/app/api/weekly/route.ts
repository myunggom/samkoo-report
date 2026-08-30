import { NextRequest, NextResponse } from "next/server";
import { getWeeklyDraft, saveWeeklyDraft } from "@/lib/store";
import { WEEKLY_COOKIE, isTokenValid } from "@/lib/weeklyAuth";
import { normalizeDraft } from "@/lib/weekly";

export const dynamic = "force-dynamic";

// proxy로 이미 잠겨 있지만, 라우트 자체에서도 인증을 재확인 (심층 방어)
function authed(req: NextRequest): boolean {
  return isTokenValid(req.cookies.get(WEEKLY_COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  return NextResponse.json(await getWeeklyDraft());
}

export async function PUT(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "인증 필요" }, { status: 401 });
  const b = await req.json().catch(() => null);
  const draft = normalizeDraft(b);
  return NextResponse.json(await saveWeeklyDraft(draft));
}
