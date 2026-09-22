"use client";

import { useState } from "react";
import type { MediaItem } from "@/lib/archive";
import { downloadMedia } from "@/lib/client";
import { prettyDay } from "@/lib/archive";

// 아카이브 사진·동영상 크게 보기(라이트박스) + 다운로드
export default function MediaViewer({ item, onClose }: { item: MediaItem; onClose: () => void }) {
  const [dl, setDl] = useState(false);

  async function download() {
    setDl(true);
    try {
      await downloadMedia(item);
    } catch {
      alert("다운로드에 실패했습니다.");
    } finally {
      setDl(false);
    }
  }

  const caption = item.title || item.note || "";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/90" onClick={onClose}>
      {/* 상단 바 */}
      <div className="flex items-center justify-between gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 truncate text-sm text-white/90">{caption || "사진"}</span>
        <div className="flex shrink-0 gap-2">
          <button onClick={download} disabled={dl} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-50">
            {dl ? "받는 중…" : "⬇ 다운로드"}
          </button>
          <button onClick={onClose} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25">✕ 닫기</button>
        </div>
      </div>

      {/* 미디어 */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-2 sm:p-4" onClick={(e) => e.stopPropagation()}>
        {item.type === "video" ? (
          <video src={item.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.url} alt={caption || "사진"} className="max-h-full max-w-full object-contain" />
        )}
      </div>

      {/* 하단 정보 */}
      <div className="p-3 text-center text-xs text-white/60" onClick={(e) => e.stopPropagation()}>
        {prettyDay(item.takenAt)}
        {item.area ? ` · ${item.area}` : ""}
        {item.uploader ? ` · ${item.uploader}` : ""}
        {item.note && caption !== item.note ? ` · ${item.note}` : ""}
      </div>
    </div>
  );
}
