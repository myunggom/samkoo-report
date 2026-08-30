"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Calendar from "@/components/Calendar";
import ScheduleModal from "@/components/ScheduleModal";
import type { Schedule } from "@/lib/types";
import { prettyDateTime, ymd } from "@/lib/format";

export default function Dashboard() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | Partial<Schedule>>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/schedules", { cache: "no-store" });
    setSchedules(res.ok ? await res.json() : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const monthList = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
    return schedules
      .filter((s) => ymd(s.start).startsWith(prefix))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [schedules, year, month]);

  function prev() {
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else setMonth(month - 1);
  }
  function next() {
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else setMonth(month + 1);
  }
  function today() {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">촬영 스케줄</h1>
        <button
          onClick={() => setModal({ start: new Date(year, month, now.getDate(), 9, 0).toISOString() })}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"
        >
          + 일정 추가
        </button>
      </div>

      <Calendar
        year={year}
        month={month}
        schedules={schedules}
        onPrev={prev}
        onNext={next}
        onToday={today}
        onEventClick={(id) => router.push(`/shoot/${id}`)}
        onAddOnDate={(iso) => setModal({ start: iso })}
      />

      {/* 이번 달 촬영 목록 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">
          {month + 1}월 촬영 목록 {loading ? "" : `(${monthList.length}건)`}
        </h2>
        {loading ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">불러오는 중…</p>
        ) : monthList.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
            이 달에 등록된 촬영이 없습니다. 오른쪽 위 <b>일정 추가</b>로 시작하세요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {monthList.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => router.push(`/shoot/${s.id}`)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {s.shootType && <span className="mr-1 text-slate-400">[{s.shootType}]</span>}
                      {s.title}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {prettyDateTime(s.start)}
                      {s.production ? ` · ${s.production}` : ""}
                      {s.manager ? ` · ${s.manager}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-slate-300">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modal && (
        <ScheduleModal
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={(s) => {
            setModal(null);
            setSchedules((prev) => {
              const idx = prev.findIndex((x) => x.id === s.id);
              if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = s;
                return copy;
              }
              return [...prev, s];
            });
            const d = new Date(s.start);
            setYear(d.getFullYear());
            setMonth(d.getMonth());
          }}
        />
      )}
    </div>
  );
}
