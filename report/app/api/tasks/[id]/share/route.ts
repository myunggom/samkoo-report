import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { addIssue, listTasks, updateTask } from "@/lib/store";
import { WEEKLY_COOKIE, isTokenValid } from "@/lib/weeklyAuth";
import type { Issue } from "@/lib/issues";

export const dynamic = "force-dynamic";

function authed(req: NextRequest): boolean {
  return isTokenValid(req.cookies.get(WEEKLY_COOKIE)?.value);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authed(req)) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const task = (await listTasks()).find((t) => t.id === id);
  if (!task) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });

  // 이미 공유됐으면 새로 만들지 않는다
  if (task.issueId) return NextResponse.json({ task, issueId: task.issueId, created: false });

  const now = new Date().toISOString();
  const issue: Issue = {
    id: randomUUID(),
    title: task.title,
    note: task.note ?? task.source ?? "",
    area: "",
    status: "open",
    photos: [],
    createdAt: now,
    updatedAt: now,
  };
  await addIssue(issue);

  const updated = await updateTask(id, { issueId: issue.id });
  return NextResponse.json({ task: updated, issueId: issue.id, created: true }, { status: 201 });
}
