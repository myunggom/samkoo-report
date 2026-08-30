import { NextRequest, NextResponse } from "next/server";
import { deleteSchedule, getSchedule, saveSchedule } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const schedule = await getSchedule(id);
  if (!schedule) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(schedule);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getSchedule(id);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json();
  // body에 있으면 그 값(빈 값이면 삭제), 없으면 기존 값 유지
  const pick = (key: keyof typeof existing) =>
    body[key] !== undefined ? (body[key] ? String(body[key]) : undefined) : existing[key];
  const schedule = await saveSchedule({
    id,
    title: String(body.title ?? existing.title),
    shootType: String(body.shootType ?? existing.shootType),
    production: String(body.production ?? existing.production),
    manager: String(body.manager ?? existing.manager),
    start: String(body.start ?? existing.start),
    end: pick("end"),
    setupStart: pick("setupStart"),
    setupEnd: pick("setupEnd"),
    shootStart: pick("shootStart"),
    shootEnd: pick("shootEnd"),
    setupTime: pick("setupTime"),
    shootTeardownTime: pick("shootTeardownTime"),
  });
  return NextResponse.json(schedule);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteSchedule(id);
  return NextResponse.json({ ok: true });
}
