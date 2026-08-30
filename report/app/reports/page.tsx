"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GenReport, ReportKind } from "@/lib/reports";
import { REPORT_KINDS, KIND_LABEL, KIND_EMOJI, dotDate, reportFileName } from "@/lib/reports";

export default function ReportsHub() {
  const router = useRouter();
  const [reports, setReports] = useState<GenReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<ReportKind | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/reports", { cache: "no-store" });
    setReports(res.ok ? await res.json() : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function create(kind: ReportKind) {
    setCreating(kind);
    try {
      const res = await fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
      if (!res.ok) throw new Error();
      const r: GenReport = await res.json();
      router.push(`/reports/${r.id}`);
    } catch {
      alert("생성에 실패했습니다.");
      setCreating(null);
    }
  }

  async function remove(id: string, label: string) {
    if (!confirm(`${label}\n삭제할까요? 되돌릴 수 없습니다.`)) return;
    setDeleting(id);
    try {
      await fetch(`/api/reports/${id}`, { method: "DELETE" });
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch {
      alert("삭제에 실패했습니다.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">보고서</h1>
        <p className="mt-1 text-sm text-slate-500">양식을 고르면 내용·사진을 채워 동일한 양식의 PDF로 출력됩니다.</p>
      </div>

      {/* 보고서 종류 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {REPORT_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => create(k)}
            disabled={creating !== null}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-slate-900 hover:shadow-sm disabled:opacity-50"
          >
            <div className="text-2xl">{KIND_EMOJI[k]}</div>
            <div className="mt-2 text-sm font-bold text-slate-800">{KIND_LABEL[k]}</div>
            <div className="mt-0.5 text-xs text-slate-400">{creating === k ? "생성 중…" : "새로 작성 →"}</div>
          </button>
        ))}
        <Link href="/pungsuhae" className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-slate-900 hover:shadow-sm">
          <div className="text-2xl">🌧️</div>
          <div className="mt-2 text-sm font-bold text-slate-800">풍수해예방보고서</div>
          <div className="mt-0.5 text-xs text-slate-400">점검표 양식 →</div>
        </Link>
      </div>

      {/* 작성한 보고서 */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-500">작성한 보고서 {loading ? "" : `(${reports.length}건)`}</h2>
        {loading ? (
          <p className="text-sm text-slate-400">불러오는 중…</p>
        ) : reports.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
            아직 작성한 보고서가 없습니다. 위에서 양식을 골라 시작하세요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {reports.map((r) => (
              <li key={r.id} className="flex items-center">
                <button onClick={() => router.push(`/reports/${r.id}`)} className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      <span className="mr-1.5 text-slate-400">{KIND_EMOJI[r.kind]}</span>
                      [{r.bracket}] {r.subject || r.docTitle || "(제목 없음)"}
                    </p>
                    <p className="truncate text-xs text-slate-500">{r.site} · {dotDate(r.date)} · 사진 {r.photos.filter((p) => p.url).length}장</p>
                  </div>
                  <span className="shrink-0 text-slate-300">›</span>
                </button>
                <button onClick={() => remove(r.id, reportFileName(r))} disabled={deleting === r.id} className="mr-2 shrink-0 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50">
                  {deleting === r.id ? "삭제 중…" : "삭제"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
