"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import PungsuhaeEditor from "@/components/PungsuhaeEditor";
import type { PungReport } from "@/lib/pungsuhae";

export default function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<PungReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/pungsuhae/${id}`, { cache: "no-store" });
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
        <Link href="/pungsuhae" className="text-sm font-medium text-slate-900 underline">
          ← 목록으로
        </Link>
      </div>
    );

  return (
    <div className="space-y-5">
      <Link href="/pungsuhae" className="inline-block text-sm text-slate-500 hover:text-slate-800">
        ← 풍수해 예방 점검 목록
      </Link>
      <PungsuhaeEditor initial={report} />
    </div>
  );
}
