import { NextRequest, NextResponse } from "next/server";
import { listSchedules, saveSchedule } from "@/lib/shoot/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const schedules = await listSchedules();
  return NextResponse.json(schedules);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.title || !body.start) {
    return NextResponse.json({ error: "촬영명과 촬영일시는 필수입니다." }, { status: 400 });
  }
  const schedule = await saveSchedule({
    title: String(body.title),
    shootType: String(body.shootType ?? ""),
    production: String(body.production ?? ""),
    manager: String(body.manager ?? ""),
    start: String(body.start),
    end: body.end ? String(body.end) : undefined,
    setupStart: body.setupStart ? String(body.setupStart) : undefined,
    setupEnd: body.setupEnd ? String(body.setupEnd) : undefined,
    shootStart: body.shootStart ? String(body.shootStart) : undefined,
    shootEnd: body.shootEnd ? String(body.shootEnd) : undefined,
    setupTime: body.setupTime ? String(body.setupTime) : undefined,
    shootTeardownTime: body.shootTeardownTime ? String(body.shootTeardownTime) : undefined,
  });
  return NextResponse.json(schedule, { status: 201 });
}
