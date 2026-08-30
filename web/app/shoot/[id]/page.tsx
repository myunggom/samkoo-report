"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReportEditor from "@/components/ReportEditor";
import EmailComposer from "@/components/EmailComposer";
import ScheduleModal from "@/components/ScheduleModal";
import type { Report, Schedule } from "@/lib/types";
import { prettyDateTime } from "@/lib/format";

export default function ShootPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<"report" | "email">("report");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const [sRes, rRes] = await Promise.all([
        fetch(`/api/schedules/${id}`, { cache: "no-store" }),
        fetch(`/api/reports/${id}`, { cache: "no-store" }),
      ]);
      if (!sRes.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setSchedule(await sRes.json());
      setReport(await rRes.json());
      setLoading(false);
    })();
  }, [id]);

  async function remove() {
    if (!confirm("이 촬영 일정과 완료보고서를 삭제할까요? 되돌릴 수 없습니다.")) return;
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (loading) return <p className="text-sm text-slate-400">불러오는 중…</p>;
  if (notFound || !schedule || !report)
    return (
      <div className="space-y-3">
        <p className="text-slate-600">해당 촬영을 찾을 수 없습니다.</p>
        <Link href="/" className="text-sm font-medium text-slate-900 underline">
          ← 대시보드로
        </Link>
      </div>
    );

  return (
    <div className="space-y-5">
      <Link href="/" className="inline-block text-sm text-slate-500 hover:text-slate-800">
        ← 대시보드
      </Link>

      {/* 헤더 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              {schedule.shootType && (
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
                  {schedule.shootType}
                </span>
              )}
            </div>
            <h1 className="truncate text-xl font-bold text-slate-900">{schedule.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{prettyDateTime(schedule.start)}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {schedule.production && <span>제작사: {schedule.production}</span>}
              {schedule.manager && <span>관리자: {schedule.manager}</span>}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              수정
            </button>
            <button
              onClick={remove}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
            >
              삭제
            </button>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-6 border-b border-slate-200">
        {[
          ["report", "완료보고서 작성"],
          ["email", "메일 내용 작성기"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as "report" | "email")}
            className={
              "-mb-px border-b-2 pb-2 text-sm font-semibold transition " +
              (tab === k ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "report" ? (
        <ReportEditor schedule={schedule} initialReport={report} />
      ) : (
        <EmailComposer schedule={schedule} />
      )}

      {editing && (
        <ScheduleModal
          initial={schedule}
          onClose={() => setEditing(false)}
          onSaved={(s) => {
            setSchedule(s);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
