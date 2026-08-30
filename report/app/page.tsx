"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MediaItem, DayNote } from "@/lib/archive";
import { MEDIA_CATEGORIES, categoryStyle, prettyDay, todayYmd } from "@/lib/archive";
import type { Issue } from "@/lib/issues";
import { STATUS_LABEL, STATUS_STYLE, daysOpen } from "@/lib/issues";
import DashCalendar from "@/components/DashCalendar";

export default function Dashboard() {
  const router = useRouter();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [notes, setNotes] = useState<DayNote[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [m, n, iss] = await Promise.all([
        fetch("/api/media", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
        fetch("/api/daynotes", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
        fetch("/api/issues", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])),
      ]);
      setMedia(m);
      setNotes(n);
      setIssues(Array.isArray(iss) ? iss : []);
      setLoading(false);
    })();
  }, []);

  const openIssues = issues.filter((i) => i.status !== "done");

  const stats = useMemo(() => {
    const month = todayYmd().slice(0, 7);
    const thisMonth = media.filter((m) => m.takenAt.startsWith(month)).length;
    const videos = media.filter((m) => m.type === "video").length;
    const byCat: Record<string, number> = {};
    MEDIA_CATEGORIES.forEach((c) => (byCat[c] = 0));
    media.forEach((m) => (byCat[m.category] = (byCat[m.category] || 0) + 1));
    return { total: media.length, thisMonth, videos, byCat };
  }, [media]);

  const recentNotes = notes.slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">대시보드</h1>
        <p className="mt-1 text-sm text-slate-500">건물 사진·동영상 아카이브와 일일 기록을 한눈에.</p>
      </div>

      {/* 빠른 이동 */}
      <div className="grid grid-cols-4 gap-2">
        <Link href="/archive" className="rounded-xl border border-slate-200 bg-white p-3 text-center hover:bg-slate-50">
          <div className="text-lg">🗂</div>
          <div className="mt-1 text-xs font-semibold text-slate-700">아카이브</div>
        </Link>
        <Link href="/logs" className="rounded-xl border border-slate-200 bg-white p-3 text-center hover:bg-slate-50">
          <div className="text-lg">📅</div>
          <div className="mt-1 text-xs font-semibold text-slate-700">일일 기록</div>
        </Link>
        <Link href="/issues" className="rounded-xl border border-slate-200 bg-white p-3 text-center hover:bg-slate-50">
          <div className="text-lg">🧩</div>
          <div className="mt-1 text-xs font-semibold text-slate-700">문제 관리</div>
        </Link>
        <Link href="/reports" className="rounded-xl border border-slate-200 bg-white p-3 text-center hover:bg-slate-50">
          <div className="text-lg">📄</div>
          <div className="mt-1 text-xs font-semibold text-slate-700">보고서</div>
        </Link>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="전체 사진·영상" value={stats.total} />
        <Stat label="이번 달" value={stats.thisMonth} />
        <Stat label="동영상" value={stats.videos} />
        <Stat label="미처리 문제" value={openIssues.length} accent={openIssues.length > 0} />
      </div>

      {/* 카테고리별 */}
      <div className="flex flex-wrap gap-2">
        {MEDIA_CATEGORIES.map((c) => (
          <Link
            key={c}
            href={`/archive`}
            className={"rounded-full border px-3 py-1 text-xs font-medium " + categoryStyle(c)}
          >
            {c} {stats.byCat[c] || 0}
          </Link>
        ))}
      </div>

      {/* 월간 캘린더 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">월간 캘린더</h2>
          <Link href="/logs" className="text-xs text-slate-500 hover:text-slate-800">일일 기록 →</Link>
        </div>
        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중…</p>
        ) : (
          <DashCalendar media={media} notes={notes} />
        )}
      </section>

      {/* 미처리 문제 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">미처리 문제 {openIssues.length > 0 && <span className="text-red-500">{openIssues.length}</span>}</h2>
          <Link href="/issues" className="text-xs text-slate-500 hover:text-slate-800">전체 →</Link>
        </div>
        {openIssues.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
            미처리 문제가 없습니다. 👍 <Link href="/issues" className="font-semibold text-slate-700 underline">문제 관리</Link>에서 등록·추적하세요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {openIssues.slice(0, 5).map((i) => (
              <li key={i.id}>
                <button onClick={() => router.push("/issues")} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      <span className={"mr-1.5 rounded-full border px-1.5 py-0.5 text-[10px] " + STATUS_STYLE[i.status]}>{STATUS_LABEL[i.status]}</span>
                      {i.title}
                    </p>
                    <p className="truncate text-xs text-slate-400">{i.area ? `[${i.area}] ` : ""}등록 {daysOpen(i.createdAt)}일 경과</p>
                  </div>
                  <span className="shrink-0 text-slate-300">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 최근 일일 기록 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">최근 일일 기록</h2>
          <Link href="/logs" className="text-xs text-slate-500 hover:text-slate-800">전체 →</Link>
        </div>
        {recentNotes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
            아직 기록이 없습니다. <Link href="/logs" className="font-semibold text-slate-700 underline">일일 기록</Link>에서 오늘 있었던 일을 남겨보세요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {recentNotes.map((n) => (
              <li key={n.date}>
                <button onClick={() => router.push("/logs")} className="block w-full px-4 py-3 text-left hover:bg-slate-50">
                  <p className="text-xs font-semibold text-slate-500">{prettyDay(n.date)}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-800">{n.note}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={"rounded-xl border bg-white p-3 " + (accent ? "border-red-200" : "border-slate-200")}>
      <div className={"text-2xl font-bold " + (accent ? "text-red-500" : "text-slate-900")}>{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
    </div>
  );
}
