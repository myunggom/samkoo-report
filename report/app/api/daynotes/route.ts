import { NextRequest, NextResponse } from "next/server";
import { listDayNotes, saveDayNote } from "@/lib/store";

export const dynamic = "force-dynamic";

// 전체 날짜별 메모 (최신순)
export async function GET() {
  return NextResponse.json(await listDayNotes());
}

// 특정 날짜 메모 저장 (내용 비면 삭제) — { date, note, base? }
//   base(편집을 시작할 때의 메모)를 주면 그 사이 다른 사람이 고친 내용과 합친다 (lib/store.ts saveDayNote)
export async function PUT(req: NextRequest) {
  const b = await req.json();
  if (!b.date || typeof b.date !== "string") {
    return NextResponse.json({ error: "date가 필요합니다." }, { status: 400 });
  }
  const { entry, joined } = await saveDayNote(String(b.date), String(b.note ?? ""), typeof b.base === "string" ? b.base : undefined);
  return NextResponse.json({ ...(entry ?? { date: b.date, note: "", updatedAt: new Date().toISOString() }), joined });
}
