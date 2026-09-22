"use client";

import type { Schedule } from "@/lib/shoot/types";
import { hhmm, ymd } from "@/lib/shoot/format";

type Props = {
  year: number;
  month: number; // 0-based
  schedules: Schedule[];
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onEventClick: (id: string) => void;
  onAddOnDate: (dateISO: string) => void;
};

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export default function Calendar({
  year,
  month,
  schedules,
  onPrev,
  onNext,
  onToday,
  onEventClick,
  onAddOnDate,
}: Props) {
  const first = new Date(year, month, 1);
  const startDay = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = ymd(new Date().toISOString());

  // 이벤트를 날짜별로 묶기
  const byDate = new Map<string, Schedule[]>();
  for (const s of schedules) {
    const key = ymd(s.start);
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(s);
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function dateKey(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
      {/* 헤더 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onPrev} className="rounded-lg px-2.5 py-1.5 text-slate-500 hover:bg-slate-100">
            ‹
          </button>
          <h2 className="min-w-[7rem] text-center text-lg font-bold text-slate-900">
            {year}년 {month + 1}월
          </h2>
          <button onClick={onNext} className="rounded-lg px-2.5 py-1.5 text-slate-500 hover:bg-slate-100">
            ›
          </button>
        </div>
        <button onClick={onToday} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
          오늘
        </button>
      </div>

      {/* 요일 */}
      <div className="grid grid-cols-7 border-b border-slate-100 pb-1 text-center text-xs font-medium">
        {WEEK.map((w, i) => (
          <div key={w} className={i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-slate-500"}>
            {w}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="min-h-[84px] border-b border-r border-slate-50" />;
          const key = dateKey(day);
          const events = byDate.get(key) ?? [];
          const isToday = key === todayStr;
          const dow = i % 7;
          return (
            <div
              key={i}
              className="group relative min-h-[84px] border-b border-r border-slate-50 p-1 align-top"
            >
              <div className="flex items-center justify-between">
                <span
                  className={
                    "inline-grid h-6 w-6 place-items-center rounded-full text-sm " +
                    (isToday
                      ? "bg-slate-900 font-bold text-white"
                      : dow === 0
                      ? "text-red-500"
                      : dow === 6
                      ? "text-blue-500"
                      : "text-slate-700")
                  }
                >
                  {day}
                </span>
                <button
                  onClick={() => onAddOnDate(new Date(year, month, day, 9, 0).toISOString())}
                  className="hidden h-5 w-5 place-items-center rounded text-slate-300 hover:bg-slate-100 hover:text-slate-600 group-hover:grid"
                  title="이 날짜에 일정 추가"
                >
                  +
                </button>
              </div>
              <div className="mt-1 space-y-1">
                {events.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => onEventClick(ev.id)}
                    className="block w-full truncate rounded-md bg-slate-900/90 px-1.5 py-0.5 text-left text-[11px] font-medium text-white hover:bg-slate-700"
                    title={`${ev.title} (${hhmm(ev.start)})`}
                  >
                    {hhmm(ev.start)} {ev.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
