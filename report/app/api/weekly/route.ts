import { NextRequest, NextResponse } from "next/server";
import { getWeeklyDraft, saveWeeklyDraft } from "@/lib/store";
import { WEEKLY_COOKIE, isTokenValid } from "@/lib/weeklyAuth";
import type { WeeklyDraft, WeeklyItem } from "@/lib/weekly";

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
  const rawItems = Array.isArray(b?.items) ? b.items : [];
  const items: WeeklyItem[] = rawItems.map((it: Record<string, unknown>) => ({
    id: String(it.id || ""),
    title: typeof it.title === "string" ? it.title : "",
    memo: typeof it.memo === "string" ? it.memo : "",
    photos: Array.isArray(it.photos)
      ? (it.photos as Record<string, unknown>[])
          .filter((p) => typeof p?.url === "string")
          .map((p) => ({ url: String(p.url), caption: typeof p.caption === "string" ? p.caption : "" }))
      : [],
  }));
  const draft: WeeklyDraft = { items, updatedAt: new Date().toISOString() };
  return NextResponse.json(await saveWeeklyDraft(draft));
}
