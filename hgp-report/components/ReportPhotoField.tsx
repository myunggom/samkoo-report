"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import type { ReportPhoto } from "@/lib/reports";
import { uploadPhoto } from "@/lib/client";
import ArchivePicker from "@/components/ArchivePicker";

// 첨부사진 편집 — 촬영(1장)·앨범(여러 장 순서대로)·아카이브(선택). 사진마다 설명.
export default function ReportPhotoField({
  photos,
  onChange,
}: {
  photos: ReportPhoto[];
  onChange: (p: ReportPhoto[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null, ref: React.RefObject<HTMLInputElement | null>) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const added: ReportPhoto[] = [];
      for (const f of Array.from(files)) {
        const url = await uploadPhoto(f);
        added.push({ url, caption: "" });
      }
      onChange([...photos, ...added]);
    } catch {
      alert("사진 업로드에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  }

  function setField(i: number, p: Partial<ReportPhoto>) {
    const copy = photos.slice();
    copy[i] = { ...copy[i], ...p };
    onChange(copy);
  }
  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= photos.length) return;
    const copy = photos.slice();
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  }
  function remove(i: number) {
    onChange(photos.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-2">
            <div className="relative overflow-hidden rounded-lg border border-slate-100 bg-slate-50">
              <div className="relative aspect-[4/3] w-full">
                {p.url ? (
                  <Image src={p.url} alt={p.caption || `사진 ${i + 1}`} fill className="object-cover" unoptimized />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xs text-slate-300">사진 없음</div>
                )}
              </div>
              <button
                onClick={() => remove(i)}
                className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-sm text-white hover:bg-black/80"
                title="삭제"
              >
                ×
              </button>
              <span className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white">PHOTO {i + 1}</span>
            </div>
            <input
              value={p.caption ?? ""}
              onChange={(e) => setField(i, { caption: e.target.value })}
              placeholder="사진 제목"
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-slate-300"
            />
            <input
              value={p.note ?? ""}
              onChange={(e) => setField(i, { note: e.target.value })}
              placeholder="부가 설명 (선택)"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-300"
            />
            <div className="mt-1 flex justify-end gap-1">
              <button onClick={() => move(i, -1)} className="rounded border border-slate-200 px-1.5 text-xs text-slate-400 hover:bg-slate-50" title="앞으로">←</button>
              <button onClick={() => move(i, 1)} className="rounded border border-slate-200 px-1.5 text-xs text-slate-400 hover:bg-slate-50" title="뒤로">→</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button onClick={() => cameraRef.current?.click()} disabled={uploading} className="rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          📷 촬영
        </button>
        <button onClick={() => albumRef.current?.click()} disabled={uploading} className="rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          🖼 앨범(여러 장)
        </button>
        <button onClick={() => setPicking(true)} disabled={uploading} className="rounded-lg border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          🗂 아카이브
        </button>
      </div>
      {uploading && <p className="mt-2 text-center text-xs text-slate-400">업로드 중…</p>}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFiles(e.target.files, cameraRef)} />
      <input ref={albumRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files, albumRef)} />

      {picking && (
        <ArchivePicker
          onClose={() => setPicking(false)}
          onPick={(m) => {
            onChange([...photos, { url: m.url, caption: m.title || m.note || "" }]);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
