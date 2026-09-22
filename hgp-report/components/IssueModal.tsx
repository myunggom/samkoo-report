"use client";

import { useState } from "react";
import type { Issue, IssueStatus, IssuePhoto } from "@/lib/issues";
import { ISSUE_STATUSES, STATUS_LABEL } from "@/lib/issues";
import ArchivePicker from "@/components/ArchivePicker";

export default function IssueModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Issue | null;
  onClose: () => void;
  onSaved: (i: Issue) => void;
}) {
  const editing = !!initial;
  const [title, setTitle] = useState(initial?.title || "");
  const [area, setArea] = useState(initial?.area || "");
  const [note, setNote] = useState(initial?.note || "");
  const [status, setStatus] = useState<IssueStatus>(initial?.status || "open");
  const [photos, setPhotos] = useState<IssuePhoto[]>(initial?.photos || []);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const body = { title, area, note, status, photos };
      const res = editing
        ? await fetch(`/api/issues/${initial!.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      onSaved(await res.json());
    } catch {
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-base font-bold text-slate-900">{editing ? "문제 수정" : "새 문제 등록"}</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">제목</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 3층 화장실 세면대 누수" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-xs text-slate-500">위치(구역)</span>
              <input value={area} onChange={(e) => setArea(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <label>
              <span className="mb-1 block text-xs text-slate-500">상태</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as IssueStatus)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">상세 내용</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>

          {/* 사진 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-slate-500">사진(선택)</span>
              <button onClick={() => setPicking(true)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">🗂 아카이브에서 추가</button>
            </div>
            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5">
                {photos.map((p, i) => (
                  <div key={i} className="relative overflow-hidden rounded-lg border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="aspect-square w-full object-cover" />
                    <button onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))} className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-xs text-white">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">취소</button>
          <button onClick={save} disabled={saving || !title.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>

        {picking && (
          <ArchivePicker
            onClose={() => setPicking(false)}
            onPick={(m) => { setPhotos([...photos, { url: m.url, caption: m.title || "" }]); setPicking(false); }}
          />
        )}
      </div>
    </div>
  );
}
