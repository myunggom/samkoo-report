import { NextRequest, NextResponse } from "next/server";
import { deleteManual, getManual, saveManual } from "@/lib/store";
import { fillManual, type Manual } from "@/lib/manual";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manual = await getManual(id);
  if (!manual) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(manual);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getManual(id);
  if (!existing) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  const b = (await req.json()) as Partial<Manual>;
  // id·만든 날짜는 넘어온 값으로 바뀌지 않는다
  const saved = await saveManual(
    fillManual({ ...existing, ...b, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() }),
  );
  return NextResponse.json(saved);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteManual(id);
  return NextResponse.json({ ok: true });
}
