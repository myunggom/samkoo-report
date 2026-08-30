import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { addIssue, listIssues } from "@/lib/store";
import type { Issue, IssuePhoto } from "@/lib/issues";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await listIssues());
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  if (!b.title) return NextResponse.json({ error: "제목은 필수입니다." }, { status: 400 });
  const now = new Date().toISOString();
  const issue: Issue = {
    id: randomUUID(),
    title: String(b.title),
    note: b.note ? String(b.note) : "",
    area: b.area ? String(b.area) : "",
    status: b.status === "in_progress" || b.status === "done" ? b.status : "open",
    photos: Array.isArray(b.photos) ? (b.photos as IssuePhoto[]) : [],
    createdAt: now,
    updatedAt: now,
  };
  return NextResponse.json(await addIssue(issue), { status: 201 });
}
