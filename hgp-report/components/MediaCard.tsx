"use client";

import { useState } from "react";
import type { MediaItem } from "@/lib/archive";
import { categoryStyle, prettyDay, fileIcon } from "@/lib/archive";
import { downloadMedia } from "@/lib/client";

type Props = {
  item: MediaItem;
  onEdit?: (item: MediaItem) => void;
  onDelete?: (item: MediaItem) => void;
  onSelect?: (item: MediaItem) => void; // 선택 모드(보고서 불러오기)
  onView?: (item: MediaItem) => void; // 크게 보기(라이트박스)
  selected?: boolean;
};

export default function MediaCard({ item, onEdit, onDelete, onSelect, onView, selected }: Props) {
  const isFile = item.type === "file";
  const caption = item.title || item.note || (isFile ? item.fileName || "문서" : "");
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadMedia(item);
    } catch {
      alert("다운로드에 실패했습니다.");
    } finally {
      setDownloading(false);
    }
  }

  const footer = (
    <div className="flex border-t border-slate-100 text-[11px]">
      <button onClick={handleDownload} disabled={downloading} className="flex-1 py-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50">
        {downloading ? "받는 중…" : "⬇ 다운로드"}
      </button>
      {onEdit && <button onClick={() => onEdit(item)} className="flex-1 border-l border-slate-100 py-1.5 text-slate-500 hover:bg-slate-50">수정</button>}
      {onDelete && <button onClick={() => onDelete(item)} className="flex-1 border-l border-slate-100 py-1.5 text-red-500 hover:bg-red-50">삭제</button>}
    </div>
  );

  // 문서: 아이콘 타일 + 파일명, 클릭하면 새 탭에서 열림
  if (isFile) {
    return (
      <div className={"group relative overflow-hidden rounded-xl border bg-white " + (selected ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-200")}>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
          <div className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-slate-50">
            <span className="text-5xl">{fileIcon(item.ext)}</span>
            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{item.ext || "file"}</span>
            <span className={"absolute left-1.5 top-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium " + categoryStyle(item.category)}>{item.category}</span>
            <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">↗ 열기</span>
          </div>
        </a>
        <div className="px-2.5 py-2">
          <p className="truncate text-xs font-medium text-slate-800" title={caption}>{caption}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {prettyDay(item.takenAt)}
            {item.area ? ` · ${item.area}` : ""}
            {item.uploader ? ` · ${item.uploader}` : ""}
          </p>
        </div>
        {footer}
      </div>
    );
  }

  // 사진·동영상: 클릭하면 크게 보기(선택 모드면 선택)
  const handleMediaClick = () => (onSelect ? onSelect(item) : onView?.(item));

  return (
    <div className={"group relative overflow-hidden rounded-xl border bg-white " + (selected ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-200")}>
      <button type="button" onClick={handleMediaClick} disabled={!onSelect && !onView} className="block w-full text-left">
        <div className="relative aspect-[4/3] w-full bg-slate-100">
          {item.type === "video" ? (
            <video src={item.url} preload="metadata" muted className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={caption || "사진"} className="h-full w-full object-cover" />
          )}
          <span className={"absolute left-1.5 top-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium " + categoryStyle(item.category)}>{item.category}</span>
          {item.type === "video" ? (
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-black/55 text-lg text-white">▶</span>
            </span>
          ) : (
            !onSelect && <span className="absolute right-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 group-hover:opacity-100">🔍 크게</span>
          )}
        </div>
      </button>

      <div className="px-2.5 py-2">
        <p className="truncate text-xs font-medium text-slate-800">{caption || <span className="text-slate-300">설명 없음</span>}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-400">
          {prettyDay(item.takenAt)}
          {item.area ? ` · ${item.area}` : ""}
          {item.uploader ? ` · ${item.uploader}` : ""}
        </p>
      </div>

      {footer}
    </div>
  );
}
