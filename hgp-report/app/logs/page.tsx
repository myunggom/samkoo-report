"use client";

import { useEffect, useMemo, useState } from "react";
import type { MediaItem, DayNote } from "@/lib/archive";
import { prettyDay, todayYmd } from "@/lib/archive";
import MediaUploader from "@/components/MediaUploader";
import MediaCard from "@/components/MediaCard";

export default function LogsPage() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [openUploader, setOpenUploader] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState<string | null>(null);
  const [newDate, setNewDate] = useState(todayYmd());
  const [extraDates, setExtraDates] = useState<string[]>([]);

  async function load() {
    setLoading(true);
    const [mRes, nRes] = await Promise.all([
      fetch("/api/media", { cache: "no-store" }),
      fetch("/api/daynotes", { cache: "no-store" }),
    ]);
    const m: MediaItem[] = mRes.ok ? await mRes.json() : [];
    const n: DayNote[] = nRes.ok ? await nRes.json() : [];
    setMedia(m);
    const map: Record<string, string> = {};
    n.forEach((d) => (map[d.date] = d.note));
    setNotes(map);
    setDrafts(map);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  // 날짜별 그룹 (미디어 날짜 ∪ 메모 날짜 ∪ 오늘 ∪ 사용자가 추가한 날짜)
  const dates = useMemo(() => {
    const set = new Set<string>([todayYmd(), ...extraDates]);
    media.forEach((m) => set.add(m.takenAt));
    Object.keys(notes).forEach((d) => set.add(d));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [media, notes, extraDates]);

  const mediaByDate = useMemo(() => {
    const map: Record<string, MediaItem[]> = {};
    media.forEach((m) => (map[m.takenAt] ||= []).push(m));
    return map;
  }, [media]);

  async function saveNote(date: string) {
    setSavingNote(date);
    try {
      await fetch("/api/daynotes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, note: drafts[date] ?? "" }),
      });
      setNotes((prev) => ({ ...prev, [date]: drafts[date] ?? "" }));
    } catch {
      alert("메모 저장에 실패했습니다.");
    } finally {
      setSavingNote(null);
    }
  }

  async function removeMedia(item: MediaItem) {
    if (!confirm("이 항목을 삭제할까요?")) return;
    setMedia((prev) => prev.filter((m) => m.id !== item.id));
    await fetch(`/api/media/${item.id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">일일 기록</h1>
          <p className="mt-1 text-sm text-slate-500">그날 건물에 있었던 일을 적고 사진·동영상을 남기세요. 날짜별로 조회됩니다.</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs text-slate-500">
            <span className="mb-1 block">날짜 추가</span>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <button
            onClick={() => setExtraDates((prev) => (prev.includes(newDate) ? prev : [...prev, newDate]))}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            기록 열기
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중…</p>
      ) : (
        <div className="space-y-4">
          {dates.map((date) => {
            const dayMedia = mediaByDate[date] || [];
            const dirty = (drafts[date] ?? "") !== (notes[date] ?? "");
            return (
              <section key={date} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">{prettyDay(date)}</h2>
                  <span className="text-xs text-slate-400">{dayMedia.length > 0 ? `사진·영상 ${dayMedia.length}` : ""}</span>
                </div>

                <textarea
                  value={drafts[date] ?? ""}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [date]: e.target.value }))}
                  placeholder="오늘 건물에 있었던 일을 적어주세요 (점검·작업·특이사항 등)"
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    onClick={() => saveNote(date)}
                    disabled={!dirty || savingNote === date}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {savingNote === date ? "저장 중…" : dirty ? "메모 저장" : "저장됨"}
                  </button>
                  <button
                    onClick={() => setOpenUploader(openUploader === date ? null : date)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {openUploader === date ? "닫기" : "＋ 사진·동영상 추가"}
                  </button>
                </div>

                {openUploader === date && (
                  <div className="mt-3">
                    <MediaUploader
                      defaultTakenAt={date}
                      onUploaded={() => {
                        setOpenUploader(null);
                        load();
                      }}
                    />
                  </div>
                )}

                {dayMedia.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {dayMedia.map((m) => (
                      <MediaCard key={m.id} item={m} onDelete={removeMedia} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
