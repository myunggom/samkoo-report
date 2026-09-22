"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import type { SearchHit } from "@/lib/search";

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") || "";
  const [input, setInput] = useState(q);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(q);
    if (!q.trim()) {
      setHits([]);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setHits(Array.isArray(d.hits) ? d.hits : []);
      })
      .catch(() => alive && setHits([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [q]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/search?q=${encodeURIComponent(input.trim())}`);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">전체 검색</h1>
        <p className="mt-1 text-sm text-slate-500">아카이브 문서·사진, 문제, 일일 기록, 일정, 보고서를 한 번에 찾습니다. (문서는 제목·설명·파일명 기준)</p>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
          placeholder="키워드 입력 (예: 누수, 소방, 계량기, 완료보고)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        <button className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">검색</button>
      </form>

      {loading ? (
        <p className="text-sm text-slate-400">찾는 중…</p>
      ) : !q.trim() ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">검색할 키워드를 입력하세요.</p>
      ) : hits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">‘{q}’에 대한 결과가 없습니다.</p>
      ) : (
        <>
          <p className="text-xs text-slate-400">{hits.length}건</p>
          <div className="space-y-2">
            {hits.map((h, i) => {
              const inner = (
                <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-400 hover:bg-slate-50">
                  <span className="mt-0.5 text-xl">{h.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500">{h.kind}</span>
                      <span className="truncate text-sm font-semibold text-slate-800">{h.title}</span>
                    </div>
                    {h.snippet && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{h.snippet}</p>}
                    {h.date && <p className="mt-0.5 text-[11px] text-slate-400">{h.date}</p>}
                  </div>
                </div>
              );
              return h.external ? (
                <a key={i} href={h.href} target="_blank" rel="noopener noreferrer" className="block">{inner}</a>
              ) : (
                <Link key={i} href={h.href} className="block">{inner}</Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">불러오는 중…</p>}>
      <SearchInner />
    </Suspense>
  );
}
