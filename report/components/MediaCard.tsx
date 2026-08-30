"use client";

import type { MediaItem } from "@/lib/archive";
import { categoryStyle, prettyDay } from "@/lib/archive";

type Props = {
  item: MediaItem;
  onEdit?: (item: MediaItem) => void;
  onDelete?: (item: MediaItem) => void;
  onSelect?: (item: MediaItem) => void; // 선택 모드(보고서 불러오기)
  selected?: boolean;
};

export default function MediaCard({ item, onEdit, onDelete, onSelect, selected }: Props) {
  const caption = item.title || item.note || "";
  return (
    <div
      className={
        "group relative overflow-hidden rounded-xl border bg-white " +
        (selected ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-200")
      }
    >
      <button
        type="button"
        onClick={() => onSelect?.(item)}
        disabled={!onSelect}
        className="block w-full text-left"
      >
        <div className="relative aspect-[4/3] w-full bg-slate-100">
          {item.type === "video" ? (
            <video
              src={item.url}
              controls={!onSelect}
              preload="metadata"
              className="h-full w-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={caption || "사진"} className="h-full w-full object-cover" />
          )}
          <span className={"absolute left-1.5 top-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium " + categoryStyle(item.category)}>
            {item.category}
          </span>
          {item.type === "video" && (
            <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              ▶ 동영상
            </span>
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

      {(onEdit || onDelete) && (
        <div className="flex border-t border-slate-100 text-[11px]">
          {onEdit && (
            <button onClick={() => onEdit(item)} className="flex-1 py-1.5 text-slate-500 hover:bg-slate-50">
              수정
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(item)}
              className="flex-1 border-l border-slate-100 py-1.5 text-red-500 hover:bg-red-50"
            >
              삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}
