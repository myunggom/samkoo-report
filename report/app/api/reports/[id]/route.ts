import { NextRequest, NextResponse } from "next/server";
import { deleteGenReport, getGenReport, saveGenReport } from "@/lib/store";
import type { GenReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getGenReport(id);
  if (!report) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(report);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getGenReport(id);
  if (!existing) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  const b = (await req.json()) as Partial<GenReport>;
  const saved = await saveGenReport({
    ...existing,
    bracket: b.bracket ?? existing.bracket,
    site: b.site ?? existing.site,
    subject: b.subject ?? existing.subject,
    docTitle: b.docTitle ?? existing.docTitle,
    date: b.date ?? existing.date,
    sections: b.sections ?? existing.sections,
    accident: b.accident ?? existing.accident,
    photos: b.photos ?? existing.photos,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json(saved);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteGenReport(id);
  return NextResponse.json({ ok: true });
}
