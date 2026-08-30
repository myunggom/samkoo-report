"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// Samkoo-Report 상단 메뉴. 경로 접두사로 활성 메뉴를 판단합니다.
const TABS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/", label: "대시보드", match: (p) => p === "/" },
  { href: "/archive", label: "아카이브", match: (p) => p.startsWith("/archive") },
  { href: "/logs", label: "일일 기록", match: (p) => p.startsWith("/logs") },
  { href: "/issues", label: "문제 관리", match: (p) => p.startsWith("/issues") },
  { href: "/reports", label: "보고서", match: (p) => p.startsWith("/reports") || p.startsWith("/report/") || p.startsWith("/pungsuhae") },
];

export default function TopNav() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [q, setQ] = useState("");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <nav className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              "shrink-0 -mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition " +
              (active
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-600")
            }
          >
            {t.label}
          </Link>
        );
      })}
      <form onSubmit={submitSearch} className="ml-auto shrink-0 py-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 전체 검색"
          aria-label="전체 검색"
          className="w-28 rounded-full border border-slate-300 px-3 py-1 text-xs focus:w-44 focus:outline-none focus:ring-1 focus:ring-slate-400 sm:w-32"
        />
      </form>
    </nav>
  );
}
