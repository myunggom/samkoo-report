import { NextRequest, NextResponse } from "next/server";
import { deleteEvent, toggleEventDone, updateEvent } from "@/lib/store";
import type { CalEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();

  // 회차 완료 토글: { action:"toggleDone", date, done? }
  if (b?.action === "toggleDone" && b.date) {
    const updated = await toggleEventDone(id, String(b.date), typeof b.done === "boolean" ? b.done : undefined);
    if (!updated) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json(updated);
  }

  const patch: Partial<CalEvent> = {};
  if (b.date !== undefined) patch.date = String(b.date);
  if (b.type !== undefined) patch.type = String(b.type);
  if (b.title !== undefined) patch.title = String(b.title);
  if (b.note !== undefined) patch.note = String(b.note);
  if (b.endDate !== undefined) patch.endDate = b.endDate ? String(b.endDate) : undefined;
  if (b.repeatUntil !== undefined) patch.repeatUntil = b.repeatUntil ? String(b.repeatUntil) : undefined;
  if (b.repeat !== undefined) patch.repeat = b.repeat as CalEvent["repeat"];
  const updated = await updateEvent(id, patch);
  if (!updated) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteEvent(id);
  return NextResponse.json({ ok: true });
}
