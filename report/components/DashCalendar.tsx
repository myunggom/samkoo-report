"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MediaItem, DayNote } from "@/lib/archive";
import type { CalEvent } from "@/lib/events";
import { EVENT_TYPES, DEFAULT_EVENT_TYPE, REPEAT_OPTIONS, eventDot, eventStyle, occursOn, isDoneOn, repeatDesc } from "@/lib/events";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const p2 = (n: number) => String(n).padStart(2, "0");

// 대시보드 월간 캘린더 — 사진 수 + 일지 + 일정(업체 방문·휴가 등). 날짜 클릭 시 상세/일정 추가.
export default function DashCalendar({ media, notes }: { media: MediaItem[]; notes: DayNote[] }) {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [openDay, setOpenDay] = useState<string | null>(null);

  async function loadEvents() {
    const res = await fetch("/api/events", { cache: "no-store" });
    setEvents(res.ok ? await res.json() : []);
  }
  useEffect(() => {
    loadEvents();
  }, []);

  const { mediaByDay, noteDays } = useMemo(() => {
    const m: Record<string, number> = {};
    media.forEach((x) => (m[x.takenAt] = (m[x.takenAt] || 0) + 1));
    return { mediaByDay: m, noteDays: new Set(notes.map((d) => d.date)) };
  }, [media, notes]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    const y = year, mo = month;
    const dim = new Date(y, mo + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const key = `${y}-${p2(mo + 1)}-${p2(d)}`;
      map[key] = events.filter((e) => occursOn(e, key));
    }
    return map;
  }, [events, year, month]);

  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const todayKey = `${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`;

  function prev() { if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1); }
  function next() { if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1); }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800">{year}년 {month + 1}월</h2>
        <div className="flex gap-1">
          <button onClick={prev} className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50">‹</button>
          <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">오늘</button>
          <button onClick={next} className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50">›</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEK.map((w, i) => (
          <div key={w} className={"pb-1 text-center text-[11px] font-semibold " + (i === 0 ? "text-red-400" : i === 6 ? "text-sky-400" : "text-slate-400")}>{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = `${year}-${p2(month + 1)}-${p2(d)}`;
          const cnt = mediaByDay[key] || 0;
          const hasNote = noteDays.has(key);
          const evs = eventsByDay[key] || [];
          const isToday = key === todayKey;
          return (
            <button
              key={i}
              onClick={() => setOpenDay(key)}
              className={"flex min-h-[62px] flex-col rounded-lg border p-1 text-left hover:bg-slate-50 " + (isToday ? "border-slate-900" : "border-slate-100")}
            >
              <div className="flex items-center justify-between">
                <span className={"text-[11px] font-medium " + (i % 7 === 0 ? "text-red-400" : i % 7 === 6 ? "text-sky-500" : "text-slate-600")}>{d}</span>
                <span className="flex items-center gap-0.5">
                  {cnt > 0 && <span className="rounded-full bg-emerald-500 px-1 text-[9px] font-bold leading-none text-white">{cnt}</span>}
                  {hasNote && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                </span>
              </div>
              <div className="mt-0.5 space-y-0.5 overflow-hidden">
                {evs.slice(0, 2).map((e) => {
                  const done = isDoneOn(e, key);
                  return (
                    <div key={e.id} className="flex items-center gap-0.5">
                      {done ? (
                        <span className="shrink-0 text-[9px] leading-none text-emerald-500">✓</span>
                      ) : (
                        <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + eventDot(e.type)} />
                      )}
                      <span className={"truncate text-[9px] " + (done ? "text-slate-300 line-through" : "text-slate-500")}>{e.title}</span>
                    </div>
                  );
                })}
                {evs.length > 2 && <span className="text-[9px] text-slate-400">+{evs.length - 2}</span>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><span className="rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">n</span> 사진·영상</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> 일일 기록</span>
        {EVENT_TYPES.map((t) => (
          <span key={t} className="flex items-center gap-1"><span className={"h-1.5 w-1.5 rounded-full " + eventDot(t)} /> {t}</span>
        ))}
      </div>

      {openDay && (
        <DayModal
          date={openDay}
          events={events.filter((e) => occursOn(e, openDay))}
          mediaCount={mediaByDay[openDay] || 0}
          hasNote={noteDays.has(openDay)}
          onClose={() => setOpenDay(null)}
          onChanged={loadEvents}
          onGotoLogs={() => router.push("/logs")}
        />
      )}
    </div>
  );
}

function DayModal({
  date, events, mediaCount, hasNote, onClose, onChanged, onGotoLogs,
}: {
  date: string; events: CalEvent[]; mediaCount: number; hasNote: boolean;
  onClose: () => void; onChanged: () => void; onGotoLogs: () => void;
}) {
  const [type, setType] = useState(DEFAULT_EVENT_TYPE);
  const [title, setTitle] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [repeat, setRepeat] = useState<CalEvent["repeat"]>("none");
  const [repeatUntil, setRepeatUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [y, m, d] = date.split("-").map(Number);
  const dow = WEEK[new Date(y, m - 1, d).getDay()];

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/events", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, endDate: repeat === "none" ? endDate || undefined : undefined, type, title, note, repeat, repeatUntil: repeatUntil || undefined }),
      });
      setTitle(""); setNote(""); setEndDate(""); setRepeat("none"); setRepeatUntil("");
      onChanged();
    } catch {
      alert("일정 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }
  async function del(id: string, isRepeat: boolean) {
    if (isRepeat && !confirm("반복 일정입니다. 전체 반복을 삭제할까요?")) return;
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    onChanged();
  }
  async function toggleDone(id: string, done: boolean) {
    await fetch(`/api/events/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggleDone", date, done }),
    });
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">{y}. {p2(m)}. {p2(d)} ({dow})</h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <button onClick={onGotoLogs} className="rounded-full border border-slate-200 px-2.5 py-1 text-slate-500 hover:bg-slate-50">
            사진·영상 {mediaCount} {hasNote ? "· 일지 있음" : ""} →
          </button>
        </div>

        {/* 일정 목록 */}
        <div className="space-y-1.5">
          {events.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">등록된 일정이 없습니다.</p>
          ) : (
            events.map((e) => {
              const done = isDoneOn(e, date);
              const rep = repeatDesc(e);
              return (
                <div key={e.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <span className={"mr-1 rounded-full border px-1.5 py-0.5 text-[10px] " + eventStyle(e.type)}>{e.type}</span>
                    {rep && <span className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">🔁 {rep}</span>}
                    <span className={"text-sm " + (done ? "text-slate-400 line-through" : "text-slate-800")}>{e.title}</span>
                    {e.endDate && e.endDate !== e.date && !rep && <span className="ml-1 text-[11px] text-slate-400">~{e.endDate.slice(5)}</span>}
                    {e.note && <p className="truncate text-[11px] text-slate-400">{e.note}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => toggleDone(e.id, !done)}
                      className={"rounded-lg border px-2 py-1 text-[11px] font-semibold " + (done ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-slate-300 text-slate-600 hover:bg-slate-50")}
                    >
                      {done ? "✓ 완료" : "완료 표시"}
                    </button>
                    <button onClick={() => del(e.id, !!e.repeat && e.repeat !== "none")} className="text-xs text-slate-300 hover:text-red-500">삭제</button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 일정 추가 */}
        <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
          <div className="flex gap-2">
            <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="내용 (예: ○○업체 방문, 김선준 휴가)" className="flex-1 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>반복</span>
            <select value={repeat} onChange={(ev) => setRepeat(ev.target.value as CalEvent["repeat"])} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {repeat === "none" ? (
              <>
                <span>종료일(기간이면)</span>
                <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </>
            ) : (
              <>
                <span>반복 종료(선택)</span>
                <input type="date" value={repeatUntil} min={date} onChange={(e) => setRepeatUntil(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </>
            )}
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="메모(선택)" className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
          <button onClick={add} disabled={saving || !title.trim()} className="w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
            {saving ? "저장 중…" : "일정 추가"}
          </button>
        </div>
      </div>
    </div>
  );
}
