import { NextRequest, NextResponse } from "next/server";
import { deletePungReport, getPungReport, savePungReport } from "@/lib/store";
import type { PungReport } from "@/lib/pungsuhae";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getPungReport(id);
  if (!report) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(report);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getPungReport(id);
  if (!existing) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  const body = (await req.json()) as Partial<PungReport>;
  const saved = await savePungReport({
    ...existing,
    date: body.date ?? existing.date,
    site: body.site ?? existing.site,
    inspector: body.inspector ?? existing.inspector,
    checklist: body.checklist ?? existing.checklist,
    sections: body.sections ?? existing.sections,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json(saved);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deletePungReport(id);
  return NextResponse.json({ ok: true });
}
