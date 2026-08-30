import { NextRequest, NextResponse } from "next/server";
import { deleteIssue, updateIssue } from "@/lib/store";
import type { Issue, IssueStatus } from "@/lib/issues";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await req.json()) as Partial<Issue>;
  const patch: Partial<Issue> = {};
  if (b.title !== undefined) patch.title = String(b.title);
  if (b.note !== undefined) patch.note = String(b.note);
  if (b.area !== undefined) patch.area = String(b.area);
  if (b.photos !== undefined) patch.photos = b.photos;
  if (b.status !== undefined) {
    const s = b.status as IssueStatus;
    patch.status = s;
    patch.resolvedAt = s === "done" ? new Date().toISOString() : undefined;
  }
  const updated = await updateIssue(id, patch);
  if (!updated) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteIssue(id);
  return NextResponse.json({ ok: true });
}
