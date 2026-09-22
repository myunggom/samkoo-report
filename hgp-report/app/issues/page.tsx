"use client";

import { useEffect, useMemo, useState } from "react";
import type { Issue, IssueStatus } from "@/lib/issues";
import { ISSUE_STATUSES, STATUS_LABEL, STATUS_COL_STYLE, daysOpen } from "@/lib/issues";
import IssueModal from "@/components/IssueModal";

export default function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; issue?: Issue | null }>({ open: false });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/issues", { cache: "no-store" });
    setIssues(res.ok ? await res.json() : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const byStatus = useMemo(() => {
    const m: Record<IssueStatus, Issue[]> = { open: [], in_progress: [], done: [] };
    issues.forEach((i) => m[i.status].push(i));
    return m;
  }, [issues]);

  async function move(issue: Issue, status: IssueStatus) {
    setIssues((prev) => prev.map((x) => (x.id === issue.id ? { ...x, status } : x)));
    await fetch(`/api/issues/${issue.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  }
  async function remove(issue: Issue) {
    if (!confirm("이 문제를 삭제할까요?")) return;
    setIssues((prev) => prev.filter((x) => x.id !== issue.id));
    await fetch(`/api/issues/${issue.id}`, { method: "DELETE" });
  }

  const nextStatus: Record<IssueStatus, IssueStatus | null> = { open: "in_progress", in_progress: "done", done: null };
  const prevStatus: Record<IssueStatus, IssueStatus | null> = { open: null, in_progress: "open", done: "in_progress" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">문제 관리</h1>
          <p className="mt-1 text-sm text-slate-500">건물 내 미처리 문제를 누적 관리 — 처리가 끝나면 완료로 옮기세요.</p>
        </div>
        <button onClick={() => setModal({ open: true, issue: null })} className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">+ 새 문제</button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ISSUE_STATUSES.map((st) => (
            <div key={st} className={"rounded-2xl border bg-slate-50/50 p-2 " + STATUS_COL_STYLE[st]}>
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-bold text-slate-700">{STATUS_LABEL[st]}</h2>
                <span className="text-xs text-slate-400">{byStatus[st].length}</span>
              </div>
              <div className="space-y-2">
                {byStatus[st].length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">없음</p>
                ) : (
                  byStatus[st].map((issue) => (
                    <div key={issue.id} className="rounded-xl border border-slate-200 bg-white p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{issue.title}</p>
                        <span className="shrink-0 text-[11px] text-slate-400">{st === "done" ? "완료" : `${daysOpen(issue.createdAt)}일`}</span>
                      </div>
                      {(issue.area || issue.note) && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                          {issue.area ? `[${issue.area}] ` : ""}{issue.note}
                        </p>
                      )}
                      {issue.photos && issue.photos.length > 0 && (
                        <div className="mt-1.5 flex gap-1">
                          {issue.photos.slice(0, 4).map((p, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={p.url} alt="" className="h-10 w-10 rounded object-cover" />
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-1">
                        {prevStatus[st] && (
                          <button onClick={() => move(issue, prevStatus[st]!)} className="rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50" title={`${STATUS_LABEL[prevStatus[st]!]}(으)로`}>‹ {STATUS_LABEL[prevStatus[st]!]}</button>
                        )}
                        {nextStatus[st] && (
                          <button onClick={() => move(issue, nextStatus[st]!)} className="rounded border border-slate-900 bg-slate-900 px-1.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-700">{STATUS_LABEL[nextStatus[st]!]} ›</button>
                        )}
                        <button onClick={() => setModal({ open: true, issue })} className="ml-auto rounded px-1.5 py-1 text-[11px] text-slate-400 hover:bg-slate-50">수정</button>
                        <button onClick={() => remove(issue)} className="rounded px-1.5 py-1 text-[11px] text-red-400 hover:bg-red-50">삭제</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <IssueModal
          initial={modal.issue}
          onClose={() => setModal({ open: false })}
          onSaved={() => { setModal({ open: false }); load(); }}
        />
      )}
    </div>
  );
}
