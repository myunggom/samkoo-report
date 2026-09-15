import { NextRequest, NextResponse } from "next/server";
import { deleteTask, updateTask } from "@/lib/store";
import { WEEKLY_COOKIE, isTokenValid } from "@/lib/weeklyAuth";
import { TASK_CATEGORIES, newStepId } from "@/lib/tasks";
import type { Task, TaskCategory, TaskStatus, TaskStep } from "@/lib/tasks";

export const dynamic = "force-dynamic";

function authed(req: NextRequest): boolean {
  return isTokenValid(req.cookies.get(WEEKLY_COOKIE)?.value);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: TaskStatus[] = ["todo", "doing", "done"];

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authed(req)) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Partial<Task>;
  const patch: Partial<Task> = {};

  if (b.title !== undefined) {
    const title = String(b.title).trim();
    if (!title) return NextResponse.json({ error: "제목은 비울 수 없습니다." }, { status: 400 });
    patch.title = title;
  }
  if (b.note !== undefined) patch.note = String(b.note).trim() || undefined;
  if (b.category !== undefined) {
    const c = b.category as TaskCategory;
    patch.category = TASK_CATEGORIES.includes(c) ? c : "etc";
  }
  if (b.due !== undefined) {
    const due = String(b.due).trim();
    patch.due = DATE_RE.test(due) ? due : undefined;
  }
  if (b.status !== undefined) {
    const s = b.status as TaskStatus;
    if (!STATUSES.includes(s)) return NextResponse.json({ error: "알 수 없는 상태입니다." }, { status: 400 });
    patch.status = s;
    // 완료를 풀면 처리 시각도 지운다
    patch.doneAt = s === "done" ? new Date().toISOString() : undefined;
  }
  if (b.steps !== undefined) {
    const arr = Array.isArray(b.steps) ? (b.steps as unknown[]) : [];
    patch.steps = arr
      .map((raw): TaskStep => {
        const s = (raw ?? {}) as Record<string, unknown>;
        const done = s.done === true;
        return {
          id: typeof s.id === "string" && s.id ? s.id : newStepId(),
          text: String(s.text ?? "").trim(),
          done,
          createdAt: typeof s.createdAt === "string" ? s.createdAt : new Date().toISOString(),
          doneAt: done ? (typeof s.doneAt === "string" ? s.doneAt : new Date().toISOString()) : undefined,
        };
      })
      .filter((s) => s.text)
      .slice(0, 100);
  }

  const updated = await updateTask(id, patch);
  if (!updated) return NextResponse.json({ error: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!authed(req)) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  await deleteTask(id);
  return NextResponse.json({ ok: true });
}
