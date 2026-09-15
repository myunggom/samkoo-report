import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { addTasks, listIssues, listTasks } from "@/lib/store";
import { WEEKLY_COOKIE, isTokenValid } from "@/lib/weeklyAuth";
import { TASK_CATEGORIES } from "@/lib/tasks";
import type { Task, TaskCategory } from "@/lib/tasks";

export const dynamic = "force-dynamic";

// proxy로 잠겨 있지만 라우트에서도 재확인 (matcher 설정 실수에 대한 이중 방어)
function authed(req: NextRequest): boolean {
  return isTokenValid(req.cookies.get(WEEKLY_COOKIE)?.value);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pickCategory(v: unknown): TaskCategory {
  return TASK_CATEGORIES.includes(v as TaskCategory) ? (v as TaskCategory) : "etc";
}

function pickText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

// 목록 + 연결된 문제의 현재 상태
export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const [tasks, issues] = await Promise.all([listTasks(), listIssues()]);
  const statusById = new Map(issues.map((i) => [i.id, i.status]));

  return NextResponse.json(
    tasks.map((t) => ({
      ...t,
      // 연결된 문제가 지워졌으면 undefined — 화면에서 "연결된 문제 없음"으로 표시
      issueStatus: t.issueId ? statusById.get(t.issueId) : undefined,
    })),
  );
}

// 생성 — 본문은 항상 배열 { tasks: [...] }. 1건이든 여러 건이든 같은 경로.
export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const b = await req.json().catch(() => null);
  const input = Array.isArray(b?.tasks) ? b.tasks : null;
  if (!input) return NextResponse.json({ error: "tasks 배열이 필요합니다." }, { status: 400 });

  const now = new Date().toISOString();
  const items: Task[] = input
    .map((entry: unknown) => {
      const it = (entry ?? {}) as Record<string, unknown>;
      const title = pickText(it.title);
      if (!title) return null;
      const due = pickText(it.due);
      const task: Task = {
        id: randomUUID(),
        title,
        note: pickText(it.note),
        category: pickCategory(it.category),
        status: "todo",
        due: due && DATE_RE.test(due) ? due : undefined,
        source: pickText(it.source),
        createdAt: now,
        updatedAt: now,
      };
      return task;
    })
    .filter((t: Task | null): t is Task => t !== null);

  if (!items.length) return NextResponse.json({ error: "저장할 항목이 없습니다." }, { status: 400 });

  return NextResponse.json(await addTasks(items), { status: 201 });
}
