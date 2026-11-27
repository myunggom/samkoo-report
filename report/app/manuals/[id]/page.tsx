"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import ManualEditor from "@/components/ManualEditor";
import type { Manual } from "@/lib/manual";

export default function ManualEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [manual, setManual] = useState<Manual | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/manuals/${id}`, { cache: "no-store" });
      if (!res.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setManual(await res.json());
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <p className="text-sm text-slate-400">불러오는 중…</p>;
  if (notFound || !manual)
    return (
      <div className="space-y-3">
        <p className="text-slate-600">해당 매뉴얼을 찾을 수 없습니다.</p>
        <Link href="/manuals" className="text-sm font-medium text-slate-900 underline">
          ← 매뉴얼 목록
        </Link>
      </div>
    );

  return (
    <div className="space-y-5">
      <Link href="/manuals" className="inline-block text-sm text-slate-500 hover:text-slate-800">
        ← 매뉴얼 목록
      </Link>
      <ManualEditor initial={manual} />
    </div>
  );
}
