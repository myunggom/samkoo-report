"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PungReport } from "@/lib/pungsuhae";
import { dotDate } from "@/lib/pungsuhae";

export default function PungsuhaeList() {
  const router = useRouter();
  const [reports, setReports] = useState<PungReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/pungsuhae", { cache: "no-store" });
    setReports(res.ok ? await res.json() : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch("/api/pungsuhae", { method: "POST" });
      if (!res.ok) throw new Error();
      const r: PungReport = await res.json();
      router.push(`/report/${r.id}`);
    } catch {
      alert("새 보고서 생성에 실패했습니다.");
      setCreating(false);
    }
  }

  async function remove(id: string, label: string) {
    if (!confirm(`${label} 보고서를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/pungsuhae/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch {
      alert("삭제에 실패했습니다.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">풍수해 예방 점검</h1>
          <p className="mt-1 text-sm text-slate-500">하절기 풍수해 예방 점검 보고서 — 일별 작성·저장</p>
        </div>
        <button
          onClick={create}
          disabled={creating}
          className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
        >
          {creating ? "생성 중…" : "+ 새 점검 보고서"}
        </button>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">
          작성된 보고서 {loading ? "" : `(${reports.length}건)`}
        </h2>
        {loading ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400">불러오는 중…</p>
        ) : reports.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
            아직 작성된 보고서가 없습니다. 오른쪽 위 <b>새 점검 보고서</b>로 시작하세요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {reports.map((r) => {
              const count = r.sections.reduce((n, s) => n + s.slots.filter((x) => x.url).length, 0);
              const label = `${dotDate(r.date)} 풍수해 예방 점검`;
              return (
                <li key={r.id} className="flex items-center">
                  <button
                    onClick={() => router.push(`/report/${r.id}`)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{label}</p>
                      <p className="truncate text-xs text-slate-500">
                        {r.site}
                        {r.inspector ? ` · 점검자 ${r.inspector}` : ""} · 사진 {count}장
                      </p>
                    </div>
                    <span className="shrink-0 text-slate-300">›</span>
                  </button>
                  <button
                    onClick={() => remove(r.id, label)}
                    disabled={deleting === r.id}
                    className="mr-2 shrink-0 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deleting === r.id ? "삭제 중…" : "삭제"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
