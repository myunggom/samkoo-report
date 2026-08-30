"use client";

import { useState } from "react";
import type { MediaItem } from "@/lib/archive";
import { MEDIA_CATEGORIES } from "@/lib/archive";

export default function MediaEditModal({
  item,
  onClose,
  onSaved,
}: {
  item: MediaItem;
  onClose: () => void;
  onSaved: (m: MediaItem) => void;
}) {
  const [category, setCategory] = useState(item.category);
  const [takenAt, setTakenAt] = useState(item.takenAt);
  const [area, setArea] = useState(item.area || "");
  const [uploader, setUploader] = useState(item.uploader || "");
  const [title, setTitle] = useState(item.title || "");
  const [note, setNote] = useState(item.note || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/media/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, takenAt, area, uploader, title, note }),
      });
      if (!res.ok) throw new Error();
      onSaved(await res.json());
    } catch {
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-base font-bold text-slate-900">사진·동영상 정보 수정</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-xs text-slate-500">분류</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
                {MEDIA_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs text-slate-500">날짜</span>
              <input type="date" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">제목/설명</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-xs text-slate-500">위치(구역)</span>
              <input value={area} onChange={(e) => setArea(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
            </label>
            <label>
              <span className="mb-1 block text-xs text-slate-500">올린 사람</span>
              <input value={uploader} onChange={(e) => setUploader(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-slate-500">상세 메모</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">취소</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
