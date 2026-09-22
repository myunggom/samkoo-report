import { NextRequest, NextResponse } from "next/server";
import { listDayNotes, saveDayNote } from "@/lib/store";

export const dynamic = "force-dynamic";

// 전체 날짜별 메모 (최신순)
export async function GET() {
  return NextResponse.json(await listDayNotes());
}

// 특정 날짜 메모 저장 (내용 비면 삭제) — { date, note }
export async function PUT(req: NextRequest) {
  const b = await req.json();
  if (!b.date || typeof b.date !== "string") {
    return NextResponse.json({ error: "date가 필요합니다." }, { status: 400 });
  }
  const saved = await saveDayNote(String(b.date), String(b.note ?? ""));
  return NextResponse.json(saved ?? { date: b.date, note: "", updatedAt: new Date().toISOString() });
}
