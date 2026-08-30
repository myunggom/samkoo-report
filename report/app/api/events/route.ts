import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { addEvent, listEvents } from "@/lib/store";
import { DEFAULT_EVENT_TYPE, type CalEvent, type RepeatKind } from "@/lib/events";

const REPEATS: RepeatKind[] = ["none", "weekly", "biweekly", "monthly", "monthly_weekday"];

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listEvents());
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.date || !b.title) {
    return NextResponse.json({ error: "날짜와 내용은 필수입니다." }, { status: 400 });
  }
  const repeat: RepeatKind = REPEATS.includes(b.repeat) ? b.repeat : "none";
  const e: CalEvent = {
    id: randomUUID(),
    date: String(b.date),
    endDate: b.endDate ? String(b.endDate) : undefined,
    type: typeof b.type === "string" && b.type ? b.type : DEFAULT_EVENT_TYPE,
    title: String(b.title),
    note: b.note ? String(b.note) : "",
    repeat,
    repeatUntil: b.repeatUntil ? String(b.repeatUntil) : undefined,
    doneDates: [],
    createdAt: new Date().toISOString(),
  };
  return NextResponse.json(await addEvent(e), { status: 201 });
}
