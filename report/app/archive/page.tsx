"use client";

import { useEffect, useMemo, useState } from "react";
import type { MediaItem } from "@/lib/archive";
import { MEDIA_CATEGORIES } from "@/lib/archive";
import MediaUploader from "@/components/MediaUploader";
import MediaCard from "@/components/MediaCard";
import MediaEditModal from "@/components/MediaEditModal";

export default function ArchivePage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string>("전체");
  const [typeFilter, setTypeFilter] = useState<"all" | "image" | "video" | "file">("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<MediaItem | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/media", { cache: "no-store" });
    setItems(res.ok ? await res.json() : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(item: MediaItem) {
    if (!confirm("이 항목을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setItems((prev) => prev.filter((m) => m.id !== item.id));
    await fetch(`/api/media/${item.id}`, { method: "DELETE" });
  }

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return items.filter((m) => {
      if (cat !== "전체" && m.category !== cat) return false;
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (kw) {
        const hay = `${m.title ?? ""} ${m.note ?? ""} ${m.area ?? ""} ${m.uploader ?? ""} ${m.fileName ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [items, cat, typeFilter, q]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">아카이브</h1>
        <p className="mt-1 text-sm text-slate-500">건물 사진·동영상·문서(PPT·워드·엑셀·PDF) 보관함 — 사진은 보고서에서 바로 불러 쓸 수 있고, 완료·발송 자료도 올려 보관하세요.</p>
      </div>

      <MediaUploader onUploaded={load} />

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {["전체", ...MEDIA_CATEGORIES].map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={"rounded-full border px-3 py-1 text-xs " + (cat === c ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-500 hover:bg-slate-50")}
            >
              {c}
            </button>
          ))}
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | "image" | "video" | "file")} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
          <option value="all">전체 종류</option>
          <option value="image">사진만</option>
          <option value="video">동영상만</option>
          <option value="file">문서만</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="검색(설명·위치·파일명)" className="ml-auto w-40 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
      </div>

      {/* 그리드 */}
      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
          {items.length === 0 ? "아직 올린 사진·동영상이 없습니다. 위에서 올려보세요." : "조건에 맞는 항목이 없습니다."}
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-400">{filtered.length}개</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {filtered.map((m) => (
              <MediaCard key={m.id} item={m} onEdit={setEditing} onDelete={remove} />
            ))}
          </div>
        </>
      )}

      {editing && (
        <MediaEditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setItems((prev) => prev.map((x) => (x.id === m.id ? m : x)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
