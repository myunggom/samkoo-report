"use client";

import { useEffect, useMemo, useState } from "react";
import type { MediaItem } from "@/lib/archive";
import { MEDIA_CATEGORIES, categoryStyle, prettyDay } from "@/lib/archive";

// 보고서 사진칸용 아카이브 선택창 — 인쇄되는 보고서라 "사진(image)"만 보여줍니다.
export default function ArchivePicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (item: MediaItem) => void;
}) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("전체");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/media", { cache: "no-store" });
      const all: MediaItem[] = res.ok ? await res.json() : [];
      setItems(all.filter((m) => m.type === "image"));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return items.filter((m) => {
      if (cat !== "전체" && m.category !== cat) return false;
      if (kw) {
        const hay = `${m.title ?? ""} ${m.note ?? ""} ${m.area ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [items, cat, q]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex h-[85vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white sm:h-[80vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-base font-bold text-slate-900">아카이브에서 사진 선택</h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
          <div className="flex flex-wrap gap-1">
            {["전체", ...MEDIA_CATEGORIES].map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={"rounded-full border px-2.5 py-1 text-xs " + (cat === c ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-500 hover:bg-slate-50")}
              >
                {c}
              </button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색" className="ml-auto w-32 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-slate-400">불러오는 중…</p>
          ) : filtered.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              선택할 사진이 없습니다. 아카이브에 사진을 먼저 올려주세요.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onPick(m)}
                  className="group overflow-hidden rounded-lg border border-slate-200 bg-white text-left hover:border-slate-900"
                >
                  <div className="relative aspect-[4/3] w-full bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt={m.title || "사진"} className="h-full w-full object-cover" />
                    <span className={"absolute left-1 top-1 rounded-full border px-1.5 py-0.5 text-[10px] " + categoryStyle(m.category)}>
                      {m.category}
                    </span>
                  </div>
                  <div className="px-1.5 py-1">
                    <p className="truncate text-[11px] text-slate-700">{m.title || m.note || "설명 없음"}</p>
                    <p className="truncate text-[10px] text-slate-400">{prettyDay(m.takenAt)}{m.area ? ` · ${m.area}` : ""}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
