"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { MediaItem, DayNote } from "@/lib/archive";
import type { CalEvent } from "@/lib/events";
import { EVENT_TYPES, DEFAULT_EVENT_TYPE, REPEAT_OPTIONS, eventDot, eventStyle, occursOn, isDoneOn, repeatDesc } from "@/lib/events";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const p2 = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
type View = "month" | "week" | "day";

// 대시보드 캘린더 — 월/주/일 보기 + 일정 드래그 이동(터치·마우스). 날짜 클릭 시 상세/추가.
export default function DashCalendar({ media, notes }: { media: MediaItem[]; notes: DayNote[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [dragTitle, setDragTitle] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const ghostRef = useRef<HTMLDivElement>(null);
  const justDragged = useRef(false);

  async function loadEvents() {
    const res = await fetch("/api/events", { cache: "no-store" });
    setEvents(res.ok ? await res.json() : []);
  }
  useEffect(() => { loadEvents(); }, []);

  const { mediaByDay, noteDays } = useMemo(() => {
    const m: Record<string, number> = {};
    media.forEach((x) => (m[x.takenAt] = (m[x.takenAt] || 0) + 1));
    return { mediaByDay: m, noteDays: new Set(notes.map((d) => d.date)) };
  }, [media, notes]);

  const evsOn = (key: string) => events.filter((e) => occursOn(e, key));

  // ── 날짜 이동(드래그/모달 공용) ──
  function addDaysKey(key: string, delta: number): string {
    const [yy, mm, dd] = key.split("-").map(Number);
    const dt = new Date(yy, mm - 1, dd + delta);
    return keyOf(dt);
  }
  function daysBetween(a: string, b: string): number {
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  }
  async function moveEvent(id: string, newDate: string) {
    const ev = events.find((e) => e.id === id);
    if (!ev || ev.date === newDate) return;
    if (ev.repeat && ev.repeat !== "none") return;
    const patch: Partial<CalEvent> = { date: newDate };
    if (ev.endDate && ev.endDate !== ev.date) patch.endDate = addDaysKey(ev.endDate, daysBetween(ev.date, newDate));
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    try {
      await fetch(`/api/events/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    } finally { loadEvents(); }
  }

  // ── 포인터 드래그(터치+마우스) ──
  function cellKeyAt(x: number, y: number): string | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return (el?.closest("[data-datekey]") as HTMLElement | null)?.getAttribute("data-datekey") || null;
  }
  function startDrag(e: React.PointerEvent, ev: CalEvent) {
    if (ev.repeat && ev.repeat !== "none") return; // 반복 일정은 이동 불가
    const startX = e.clientX, startY = e.clientY;
    let active = false;
    const move = (me: PointerEvent) => {
      if (!active) {
        if (Math.hypot(me.clientX - startX, me.clientY - startY) < 8) return;
        active = true; setDragActive(true); setDragTitle(ev.title || "일정");
      }
      me.preventDefault();
      if (ghostRef.current) ghostRef.current.style.transform = `translate(${me.clientX + 10}px, ${me.clientY + 10}px)`;
      const key = cellKeyAt(me.clientX, me.clientY);
      setDragOverKey((prev) => (prev === key ? prev : key));
    };
    const up = (ue: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (active) {
        const key = cellKeyAt(ue.clientX, ue.clientY);
        if (key) moveEvent(ev.id, key);
        justDragged.current = true;
        setTimeout(() => { justDragged.current = false; }, 60);
      }
      setDragActive(false); setDragOverKey(null);
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  function openIfNotDragged(key: string) { if (!justDragged.current) setOpenDay(key); }

  // ── 이동/타이틀 ──
  function shift(dir: number) {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setCursor(d);
  }
  const title = useMemo(() => {
    if (view === "month") return `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`;
    if (view === "day") return `${cursor.getFullYear()}. ${p2(cursor.getMonth() + 1)}. ${p2(cursor.getDate())} (${WEEK[cursor.getDay()]})`;
    const s = new Date(cursor); s.setDate(cursor.getDate() - cursor.getDay());
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return `${s.getMonth() + 1}.${p2(s.getDate())} ~ ${e.getMonth() + 1}.${p2(e.getDate())}`;
  }, [view, cursor]);

  const todayKey = keyOf(new Date());

  // ── 셀 렌더 (월/주/일 공용) ──
  function Chip({ e, dateKey, big }: { e: CalEvent; dateKey: string; big?: boolean }) {
    const done = isDoneOn(e, dateKey);
    const isRepeat = !!e.repeat && e.repeat !== "none";
    return (
      <div
        onPointerDown={(pe) => startDrag(pe, e)}
        style={isRepeat ? undefined : { touchAction: "none" }}
        title={isRepeat ? "반복 일정은 이동할 수 없어요" : "끌어서 다른 날짜로 이동"}
        className={"flex items-center gap-1 rounded " + (big ? "px-1.5 py-1 " : "") + (isRepeat ? "" : "cursor-grab active:cursor-grabbing hover:bg-slate-100")}
      >
        {done ? <span className="shrink-0 text-emerald-500" style={{ fontSize: big ? 12 : 9, lineHeight: 1 }}>✓</span>
          : <span className={"shrink-0 rounded-full " + eventDot(e.type)} style={{ width: big ? 7 : 6, height: big ? 7 : 6 }} />}
        <span className={(big ? "text-xs " : "text-[9px] ") + (done ? "text-slate-300 line-through" : "text-slate-600") + (big ? " truncate" : " truncate")}>{e.title}</span>
        {big && isRepeat && <span className="rounded bg-slate-100 px-1 text-[9px] text-slate-400">🔁</span>}
      </div>
    );
  }

  function DayCell({ d, dateKey, weekdayIdx, maxEvents, minH }: { d: number; dateKey: string; weekdayIdx: number; maxEvents: number; minH: number }) {
    const cnt = mediaByDay[dateKey] || 0;
    const hasNote = noteDays.has(dateKey);
    const evs = evsOn(dateKey);
    const isToday = dateKey === todayKey;
    const shown = maxEvents >= 999 ? evs : evs.slice(0, maxEvents);
    return (
      <div
        data-datekey={dateKey}
        onClick={() => openIfNotDragged(dateKey)}
        onDragOver={(ev) => ev.preventDefault()}
        style={{ minHeight: minH }}
        className={"flex cursor-pointer flex-col rounded-lg border p-1 text-left hover:bg-slate-50 " +
          (dragOverKey === dateKey ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-400" : isToday ? "border-slate-900" : "border-slate-100")}
      >
        <div className="flex items-center justify-between">
          <span className={"text-[11px] font-medium " + (weekdayIdx === 0 ? "text-red-400" : weekdayIdx === 6 ? "text-sky-500" : "text-slate-600")}>{d}</span>
          <span className="flex items-center gap-0.5">
            {cnt > 0 && <span className="rounded-full bg-emerald-500 px-1 text-[9px] font-bold leading-none text-white">{cnt}</span>}
            {hasNote && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
          </span>
        </div>
        <div className="mt-0.5 space-y-0.5 overflow-hidden">
          {shown.map((e) => <Chip key={e.id} e={e} dateKey={dateKey} big={maxEvents >= 999} />)}
          {evs.length > shown.length && <span className="text-[9px] text-slate-400">+{evs.length - shown.length}</span>}
        </div>
      </div>
    );
  }

  // 월/주/일별 렌더 데이터
  let body: ReactNode = null;
  if (view === "month") {
    const y = cursor.getFullYear(), mo = cursor.getMonth();
    const startPad = new Date(y, mo, 1).getDay();
    const dim = new Date(y, mo + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    body = (
      <div className="grid grid-cols-7 gap-1">
        {WEEK.map((w, i) => <div key={w} className={"pb-1 text-center text-[11px] font-semibold " + (i === 0 ? "text-red-400" : i === 6 ? "text-sky-400" : "text-slate-400")}>{w}</div>)}
        {cells.map((d, i) => d === null ? <div key={i} /> :
          <DayCell key={i} d={d} dateKey={`${y}-${p2(mo + 1)}-${p2(d)}`} weekdayIdx={i % 7} maxEvents={2} minH={62} />)}
      </div>
    );
  } else if (view === "week") {
    const s = new Date(cursor); s.setDate(cursor.getDate() - cursor.getDay());
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d; });
    body = (
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => <div key={"h" + i} className={"pb-1 text-center text-[11px] font-semibold " + (i === 0 ? "text-red-400" : i === 6 ? "text-sky-400" : "text-slate-400")}>{WEEK[i]} {d.getDate()}</div>)}
        {days.map((d, i) => <DayCell key={i} d={d.getDate()} dateKey={keyOf(d)} weekdayIdx={i} maxEvents={999} minH={150} />)}
      </div>
    );
  } else {
    body = (
      <div className="grid grid-cols-1">
        <DayCell d={cursor.getDate()} dateKey={keyOf(cursor)} weekdayIdx={cursor.getDay()} maxEvents={999} minH={280} />
        <p className="mt-2 text-center text-[11px] text-slate-400">날짜를 누르면 일정 추가·수정·완료 표시를 할 수 있어요.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
            {(["month", "week", "day"] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)} className={"px-2.5 py-1 " + (view === v ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50")}>
                {v === "month" ? "월" : v === "week" ? "주" : "일"}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button onClick={() => shift(-1)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50">‹</button>
            <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setCursor(d); }} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">오늘</button>
            <button onClick={() => shift(1)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-600 hover:bg-slate-50">›</button>
          </div>
        </div>
      </div>

      {body}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><span className="rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">n</span> 사진·영상</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> 일일 기록</span>
        {EVENT_TYPES.map((t) => <span key={t} className="flex items-center gap-1"><span className={"h-1.5 w-1.5 rounded-full " + eventDot(t)} /> {t}</span>)}
        <span className="text-slate-300">· 일정을 끌어 다른 날짜로 이동</span>
      </div>

      {dragActive && (
        <div ref={ghostRef} className="pointer-events-none fixed left-0 top-0 z-[70] rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white shadow-lg" style={{ transform: "translate(-999px,-999px)" }}>
          {dragTitle}
        </div>
      )}

      {openDay && (
        <DayModal
          date={openDay}
          events={evsOn(openDay)}
          mediaCount={mediaByDay[openDay] || 0}
          hasNote={noteDays.has(openDay)}
          onClose={() => setOpenDay(null)}
          onChanged={loadEvents}
          onMove={moveEvent}
          onGotoLogs={() => router.push("/logs")}
        />
      )}
    </div>
  );
}

function DayModal({
  date, events, mediaCount, hasNote, onClose, onChanged, onMove, onGotoLogs,
}: {
  date: string; events: CalEvent[]; mediaCount: number; hasNote: boolean;
  onClose: () => void; onChanged: () => void; onMove: (id: string, newDate: string) => void; onGotoLogs: () => void;
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

        <div className="space-y-1.5">
          {events.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">등록된 일정이 없습니다.</p>
          ) : (
            events.map((e) => {
              const done = isDoneOn(e, date);
              const rep = repeatDesc(e);
              const canMove = !(e.repeat && e.repeat !== "none");
              return (
                <div key={e.id} className="rounded-lg border border-slate-100 px-2.5 py-1.5">
                  <div className="flex items-start justify-between gap-2">
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
                      <button onClick={() => del(e.id, !canMove)} className="text-xs text-slate-300 hover:text-red-500">삭제</button>
                    </div>
                  </div>
                  {canMove && (
                    <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-400" title="날짜 이동">
                      <span>📅 날짜 이동</span>
                      <input type="date" value={date} onChange={(ev) => { if (ev.target.value) { onMove(e.id, ev.target.value); onClose(); } }} className="rounded border border-slate-200 px-1 py-0.5 text-[11px]" />
                    </label>
                  )}
                </div>
              );
            })
          )}
        </div>

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
