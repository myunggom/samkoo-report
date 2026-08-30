"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import type { Photo } from "@/lib/types";
import { uploadPhoto } from "@/lib/client";

type Props = {
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
};

const MIN_SLOTS = 4;

export default function PhotoGrid({ photos, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null); // 바로 촬영
  const galleryRef = useRef<HTMLInputElement>(null); // 앨범에서 선택

  async function handleFiles(files: FileList | null, ref: React.RefObject<HTMLInputElement | null>) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const added: Photo[] = [];
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

  function remove(idx: number) {
    onChange(photos.filter((_, i) => i !== idx));
  }
  function setCaption(idx: number, caption: string) {
    const copy = [...photos];
    copy[idx] = { ...copy[idx], caption };
    onChange(copy);
  }

  const emptySlots = Math.max(0, MIN_SLOTS - photos.length);

  return (
    <div>
      {/* 바로 촬영: 폰 카메라를 바로 엶 */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files, cameraRef)}
      />
      {/* 앨범에서 선택: 여러 장 가능 */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files, galleryRef)}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {photos.map((p, idx) => (
          <div key={idx} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <div className="relative aspect-[4/3] w-full">
              <Image src={p.url} alt={p.caption || `사진 ${idx + 1}`} fill className="object-cover" unoptimized />
            </div>
            <button
              onClick={() => remove(idx)}
              className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-sm text-white hover:bg-black/80"
              title="삭제"
            >
              ×
            </button>
            <input
              value={p.caption ?? ""}
              onChange={(e) => setCaption(idx, e.target.value)}
              placeholder="설명(선택)"
              className="w-full border-t border-slate-200 px-2 py-1.5 text-xs focus:outline-none"
            />
          </div>
        ))}

        {/* 빈 슬롯(최소 4칸 유지) — 누르면 앨범 선택 */}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <button
            key={`empty-${i}`}
            onClick={() => galleryRef.current?.click()}
            disabled={uploading}
            className="grid aspect-[4/3] place-items-center rounded-xl border-2 border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
          >
            <span className="text-center text-xs">
              <span className="block text-2xl">＋</span>
              사진 추가
            </span>
          </button>
        ))}
      </div>

      {/* 두 가지 방법: 바로 촬영 / 앨범에서 선택 */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          📷 카메라 촬영
        </button>
        <button
          onClick={() => galleryRef.current?.click()}
          disabled={uploading}
          className="rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          🖼 앨범에서 선택
        </button>
      </div>
      {uploading && <p className="mt-2 text-center text-xs text-slate-400">업로드 중…</p>}
    </div>
  );
}
