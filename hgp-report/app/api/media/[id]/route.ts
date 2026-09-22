import { NextRequest, NextResponse } from "next/server";
import { deleteMedia, updateMedia } from "@/lib/store";
import type { MediaItem } from "@/lib/archive";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json()) as Partial<MediaItem>;
  const patch: Partial<MediaItem> = {};
  for (const k of ["category", "title", "note", "area", "takenAt", "uploader"] as const) {
    if (b[k] !== undefined) patch[k] = String(b[k]);
  }
  const updated = await updateMedia(id, patch);
  if (!updated) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteMedia(id);
  return NextResponse.json({ ok: true });
}
