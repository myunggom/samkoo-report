"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import GenReportEditor from "@/components/GenReportEditor";
import type { GenReport } from "@/lib/reports";

export default function ReportEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<GenReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/reports/${id}`, { cache: "no-store" });
      if (!res.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setReport(await res.json());
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p className="text-sm text-slate-400">불러오는 중…</p>;
  if (notFound || !report)
    return (
      <div className="space-y-3">
        <p className="text-slate-600">해당 보고서를 찾을 수 없습니다.</p>
        <Link href="/reports" className="text-sm font-medium text-slate-900 underline">← 보고서 목록</Link>
      </div>
    );

  return (
    <div className="space-y-5">
      <Link href="/reports" className="inline-block text-sm text-slate-500 hover:text-slate-800">← 보고서 목록</Link>
      <GenReportEditor initial={report} />
    </div>
  );
}
