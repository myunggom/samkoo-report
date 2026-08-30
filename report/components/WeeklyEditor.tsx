"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { WeeklyDraft, WeeklyItem } from "@/lib/weekly";
import { emptyItem } from "@/lib/weekly";
import { uploadPhoto } from "@/lib/client";

export default function WeeklyEditor({ initial }: { initial: WeeklyDraft }) {
  const router = useRouter();
  const [items, setItems] = useState<WeeklyItem[]>(initial.items.length ? initial.items : [emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function patchItem(id: string, p: Partial<WeeklyItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }
  function removeItem(id: string) {
    if (!confirm("이 업무 항목을 삭제할까요?")) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/weekly", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error();
      setSavedAt(new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/weekly/auth", { method: "DELETE" });
    router.push("/weekly-report/login");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">🔒 주간 업무보고 작성</h1>
          <p className="text-xs text-slate-500">업무 항목별로 사진과 메모를 남겨 두세요. (사장님 전용)</p>
        </div>
        <button onClick={logout} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">
          로그아웃
        </button>
      </div>

      <div className="space-y-4">
        {items.map((it, idx) => (
          <ItemCard key={it.id} index={idx} item={it} onPatch={patchItem} onRemove={removeItem} canRemove={items.length > 1} />
        ))}
      </div>

      <button
        onClick={addItem}
        className="w-full rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm text-slate-400 hover:border-slate-400 hover:bg-slate-50"
      >
        ＋ 업무 항목 추가
      </button>

      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <span className="text-xs text-slate-400">{savedAt ? `저장됨 · ${savedAt}` : "아직 저장 안 됨"}</span>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemCard({
  index,
  item,
  onPatch,
  onRemove,
  canRemove,
}: {
  index: number;
  item: WeeklyItem;
  onPatch: (id: string, p: Partial<WeeklyItem>) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null, ref: React.RefObject<HTMLInputElement | null>) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const added = [];
      for (const f of Array.from(files)) {
        const url = await uploadPhoto(f);
        added.push({ url, caption: "" });
      }
      onPatch(item.id, { photos: [...item.photos, ...added] });
    } catch {
      alert("사진 업로드에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  }
  function setCaption(i: number, caption: string) {
    const copy = item.photos.slice();
    copy[i] = { ...copy[i], caption };
    onPatch(item.id, { photos: copy });
  }
  function removePhoto(i: number) {
    onPatch(item.id, { photos: item.photos.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">
          {index + 1}
        </span>
        <input
          value={item.title}
          onChange={(e) => onPatch(item.id, { title: e.target.value })}
          placeholder="업무 항목 제목 (예: 소방설비 정기점검)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-slate-300"
        />
        {canRemove && (
          <button onClick={() => onRemove(item.id)} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50">
            삭제
          </button>
        )}
      </div>

      <textarea
        value={item.memo}
        onChange={(e) => onPatch(item.id, { memo: e.target.value })}
        rows={3}
        placeholder="메모 — 무엇을 했는지 자유롭게 적으세요. (나중에 슬라이드 문구로 정리됩니다)"
        className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
      />

      {item.photos.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {item.photos.map((p, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-2">
              <div className="relative overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
                <div className="relative aspect-[4/3] w-full">
                  <Image src={p.url} alt={p.caption || `사진 ${i + 1}`} fill className="object-cover" unoptimized />
                </div>
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-sm text-white hover:bg-black/80"
                  title="삭제"
                >
                  ×
                </button>
              </div>
              <input
                value={p.caption ?? ""}
                onChange={(e) => setCaption(i, e.target.value)}
                placeholder="사진 설명"
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-300"
              />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => cameraRef.current?.click()} disabled={uploading} className="rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          📷 촬영
        </button>
        <button onClick={() => albumRef.current?.click()} disabled={uploading} className="rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          🖼 앨범(여러 장)
        </button>
      </div>
      {uploading && <p className="mt-2 text-center text-xs text-slate-400">업로드 중…</p>}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files, cameraRef)} />
      <input ref={albumRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files, albumRef)} />
    </div>
  );
}
