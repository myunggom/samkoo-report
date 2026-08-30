"use client";

import { useRef, useState } from "react";
import { uploadToArchive, registerMedia } from "@/lib/client";
import { MEDIA_CATEGORIES, DEFAULT_CATEGORY, todayYmd, mediaTypeOf } from "@/lib/archive";

type Staged = { file: File; type: "image" | "video"; pct: number; done: boolean };

export default function MediaUploader({
  defaultTakenAt,
  defaultCategory,
  onUploaded,
}: {
  defaultTakenAt?: string;
  defaultCategory?: string;
  onUploaded?: () => void;
}) {
  const [staged, setStaged] = useState<Staged[]>([]);
  const [category, setCategory] = useState(defaultCategory || DEFAULT_CATEGORY);
  const [takenAt, setTakenAt] = useState(defaultTakenAt || todayYmd());
  const [area, setArea] = useState("");
  const [uploader, setUploader] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).map((file) => ({ file, type: mediaTypeOf(file), pct: 0, done: false }));
    setStaged((prev) => [...prev, ...next]);
  }

  function removeStaged(i: number) {
    setStaged((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function uploadAll() {
    if (staged.length === 0) return;
    setBusy(true);
    try {
      for (let i = 0; i < staged.length; i++) {
        const s = staged[i];
        if (s.done) continue;
        const { url, type } = await uploadToArchive(s.file, (pct) =>
          setStaged((prev) => prev.map((x, idx) => (idx === i ? { ...x, pct } : x)))
        );
        await registerMedia({ url, type, category, takenAt, area, uploader, note });
        setStaged((prev) => prev.map((x, idx) => (idx === i ? { ...x, pct: 100, done: true } : x)));
      }
      setStaged([]);
      setNote("");
      onUploaded?.();
    } catch {
      alert("업로드에 실패했습니다. 파일 크기·네트워크를 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">사진·동영상 올리기</h2>
        <span className="text-xs text-slate-400">여러 개 한 번에 가능</span>
      </div>

      {/* 공통 정보 */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="col-span-2 sm:col-span-1">
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
        <label>
          <span className="mb-1 block text-xs text-slate-500">위치(구역)</span>
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="예: 지하3층" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
        </label>
        <label>
          <span className="mb-1 block text-xs text-slate-500">올린 사람</span>
          <input value={uploader} onChange={(e) => setUploader(e.target.value)} placeholder="이름(선택)" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
        </label>
      </div>
      <label className="mt-2 block">
        <span className="mb-1 block text-xs text-slate-500">설명(선택 — 이 묶음 공통)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="무슨 사진인지 간단히" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
      </label>

      {/* 파일 선택 */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => cameraRef.current?.click()} disabled={busy} className="rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          📷 카메라 촬영
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          🖼 사진·동영상 선택
        </button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); if (cameraRef.current) cameraRef.current.value = ""; }} />
      <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }} />

      {/* 대기 목록 */}
      {staged.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {staged.map((s, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
              <span className="shrink-0">{s.type === "video" ? "🎬" : "🖼"}</span>
              <span className="min-w-0 flex-1 truncate text-slate-600">{s.file.name}</span>
              {busy ? (
                <span className="shrink-0 tabular-nums text-slate-400">{s.done ? "완료" : `${s.pct}%`}</span>
              ) : (
                <button onClick={() => removeStaged(i)} className="shrink-0 text-slate-400 hover:text-red-500">✕</button>
              )}
            </div>
          ))}
          <button onClick={uploadAll} disabled={busy} className="mt-1 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? "업로드 중…" : `${staged.length}개 업로드`}
          </button>
        </div>
      )}
    </div>
  );
}
