"use client";

import { useEffect, useMemo, useState } from "react";
import type { DueGroup, ParsedTask, Task, TaskCategory } from "@/lib/tasks";
import {
  CATEGORY_LABEL,
  CATEGORY_STYLE,
  DUE_GROUPS,
  DUE_GROUP_LABEL,
  DUE_GROUP_STYLE,
  TASK_CATEGORIES,
  dueGroup,
} from "@/lib/tasks";
import type { IssueStatus } from "@/lib/issues";
import { STATUS_LABEL as ISSUE_STATUS_LABEL, STATUS_STYLE as ISSUE_STATUS_STYLE } from "@/lib/issues";

type TaskRow = Task & { issueStatus?: IssueStatus };
type Suggestion = ParsedTask & { picked: boolean };

const EMPTY_DRAFT: ParsedTask = { title: "", category: "etc", shared: false };

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const [draft, setDraft] = useState<ParsedTask | null>(null);
  const [showDone, setShowDone] = useState(false);

  async function load() {
    const res = await fetch("/api/tasks", { cache: "no-store" });
    setTasks(res.ok ? await res.json() : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  // ── AI 정리 ────────────────────────────────────────────────────
  async function parse() {
    setParsing(true);
    setError("");
    try {
      const res = await fetch("/api/tasks/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 실패해도 입력한 원문은 지우지 않는다 — 그대로 다시 누르면 재시도된다
        setError(d.error || "정리에 실패했습니다.");
        return;
      }
      setSuggestions((d.tasks as ParsedTask[]).map((t) => ({ ...t, picked: true })));
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setParsing(false);
    }
  }

  function editSuggestion(i: number, patch: Partial<Suggestion>) {
    setSuggestions((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  // 고른 제안을 저장하고, 공유 체크한 항목은 이어서 문제로 등록
  async function saveSelected() {
    const picked = suggestions.filter((s) => s.picked && s.title.trim());
    if (!picked.length) return;

    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: picked }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "저장에 실패했습니다.");
      return;
    }
    const saved = (await res.json()) as Task[];

    // 제안에서 공유를 체크한 것만 문제로 등록 (저장 순서가 보존된다)
    await Promise.all(
      saved.map((t, i) => (picked[i]?.shared ? fetch(`/api/tasks/${t.id}/share`, { method: "POST" }) : null)),
    );

    setSuggestions([]);
    setText("");
    await load();
  }

  // ── 개별 조작 ──────────────────────────────────────────────────
  async function toggleDone(t: TaskRow) {
    const status = t.status === "done" ? "todo" : "done";
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status } : x)));
    await fetch(`/api/tasks/${t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function share(t: TaskRow) {
    await fetch(`/api/tasks/${t.id}/share`, { method: "POST" });
    load();
  }

  async function remove(t: TaskRow) {
    if (!confirm(`'${t.title}' 항목을 삭제할까요?`)) return;
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
  }

  async function saveDraft() {
    if (!draft?.title.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks: [draft] }),
    });
    setDraft(null);
    load();
  }

  // ── 마감일 그룹 ────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const now = new Date();
    const m: Record<DueGroup, TaskRow[]> = { overdue: [], today: [], week: [], later: [], none: [] };
    tasks.filter((t) => t.status !== "done").forEach((t) => m[dueGroup(t.due, now)].push(t));
    return m;
  }, [tasks]);

  const doneTasks = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">할 일</h1>
        <p className="mt-1 text-sm text-slate-500">
          회의 내용이나 업무 메모를 그대로 붙여넣으면 AI가 할 일로 정리해 줍니다. 본인만 보는 탭입니다.
        </p>
      </div>

      {/* 붙여넣기 → AI 정리 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="예) 오늘 회의 — 3층 수신기 계속 오작동해서 금요일까지 업체 견적 받기로 함. 임대차 계약 갱신 건은 다음 주까지 검토."
          className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-red-500">{error}</p>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setDraft(EMPTY_DRAFT)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              + 직접 추가
            </button>
            <button
              onClick={parse}
              disabled={parsing || !text.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {parsing ? "정리하는 중…" : "AI로 정리"}
            </button>
          </div>
        </div>
      </div>

      {/* 직접 추가 */}
      {draft && (
        <div className="rounded-2xl border border-slate-300 bg-white p-4">
          <h2 className="mb-2 text-sm font-bold text-slate-700">직접 추가</h2>
          <TaskFields value={draft} onChange={(p) => setDraft({ ...draft, ...p })} />
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setDraft(null)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              onClick={saveDraft}
              disabled={!draft.title.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      )}

      {/* AI 제안 */}
      {suggestions.length > 0 && (
        <div className="rounded-2xl border border-slate-900 bg-white p-4">
          <h2 className="mb-1 text-sm font-bold text-slate-900">AI 제안 {suggestions.length}건</h2>
          <p className="mb-3 text-xs text-slate-500">저장할 항목을 고르고, 필요하면 여기서 바로 고치세요.</p>
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <div key={i} className="rounded-xl border border-slate-200 p-3">
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={s.picked}
                    onChange={(e) => editSuggestion(i, { picked: e.target.checked })}
                    className="h-4 w-4"
                  />
                  저장하기
                </label>
                <TaskFields value={s} onChange={(p) => editSuggestion(i, p)} />
                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={s.shared}
                    onChange={(e) => editSuggestion(i, { shared: e.target.checked })}
                    className="h-4 w-4"
                  />
                  문제 관리로 공유{s.reason ? ` — ${s.reason}` : ""}
                </label>
                {s.source && (
                  <p className="mt-2 border-l-2 border-slate-200 pl-2 text-xs text-slate-400">원문: {s.source}</p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setSuggestions([])}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              버리기
            </button>
            <button
              onClick={saveSelected}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              선택 항목 저장
            </button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중…</p>
      ) : (
        <div className="space-y-4">
          {DUE_GROUPS.map((g) =>
            grouped[g].length === 0 ? null : (
              <div key={g}>
                <div className="mb-2 flex items-center gap-2">
                  <span className={"rounded-full border px-2 py-0.5 text-xs font-bold " + DUE_GROUP_STYLE[g]}>
                    {DUE_GROUP_LABEL[g]}
                  </span>
                  <span className="text-xs text-slate-400">{grouped[g].length}</span>
                </div>
                <div className="space-y-2">
                  {grouped[g].map((t) => (
                    <TaskCard key={t.id} task={t} onToggle={toggleDone} onShare={share} onRemove={remove} />
                  ))}
                </div>
              </div>
            ),
          )}

          {tasks.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
              아직 할 일이 없습니다. 위에 메모를 붙여넣어 보세요.
            </p>
          )}

          {doneTasks.length > 0 && (
            <div>
              <button
                onClick={() => setShowDone(!showDone)}
                className="text-sm font-semibold text-slate-400 hover:text-slate-600"
              >
                {showDone ? "▾" : "▸"} 완료 {doneTasks.length}건
              </button>
              {showDone && (
                <div className="mt-2 space-y-2">
                  {doneTasks.map((t) => (
                    <TaskCard key={t.id} task={t} onToggle={toggleDone} onShare={share} onRemove={remove} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 제목·메모·카테고리·마감일 입력 묶음 — 제안 수정과 직접 추가가 함께 쓴다
function TaskFields({ value, onChange }: { value: ParsedTask; onChange: (patch: Partial<ParsedTask>) => void }) {
  return (
    <div className="space-y-2">
      <input
        value={value.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="할 일"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
      <input
        value={value.note ?? ""}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder="메모 (선택)"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
      <div className="flex gap-2">
        <select
          value={value.category}
          onChange={(e) => onChange({ category: e.target.value as TaskCategory })}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
        >
          {TASK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={value.due ?? ""}
          onChange={(e) => onChange({ due: e.target.value || undefined })}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onToggle,
  onShare,
  onRemove,
}: {
  task: TaskRow;
  onToggle: (t: TaskRow) => void;
  onShare: (t: TaskRow) => void;
  onRemove: (t: TaskRow) => void;
}) {
  const done = task.status === "done";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          onChange={() => onToggle(task)}
          className="mt-0.5 h-4 w-4 shrink-0"
          aria-label="완료"
        />
        <div className="min-w-0 flex-1">
          <p className={"text-sm font-semibold " + (done ? "text-slate-400 line-through" : "text-slate-800")}>
            {task.title}
          </p>
          {task.note && <p className="mt-0.5 text-xs text-slate-500">{task.note}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className={"rounded-full border px-2 py-0.5 text-xs " + CATEGORY_STYLE[task.category]}>
              {CATEGORY_LABEL[task.category]}
            </span>
            {task.due && <span className="text-xs text-slate-500">{task.due.slice(5).replace("-", "/")}</span>}
            {task.issueId &&
              (task.issueStatus ? (
                <a
                  href="/issues"
                  className={"rounded-full border px-2 py-0.5 text-xs " + ISSUE_STATUS_STYLE[task.issueStatus]}
                >
                  {ISSUE_STATUS_LABEL[task.issueStatus]} ▸ 문제 관리
                </a>
              ) : (
                <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-400">
                  연결된 문제 없음
                </span>
              ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {!task.issueId && (
            <button
              onClick={() => onShare(task)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              공유
            </button>
          )}
          <button
            onClick={() => onRemove(task)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-500"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
