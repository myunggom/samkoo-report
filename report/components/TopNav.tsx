"use client";

import { useEffect, useState } from "react";
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

// 로그인한 본인에게만 보이는 탭
const PRIVATE_TABS: typeof TABS = [
  { href: "/tasks", label: "할 일", match: (p) => p.startsWith("/tasks") },
];

export default function TopNav() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [q, setQ] = useState("");

  // wr_ui는 표시 여부만 결정한다 (실제 잠금은 proxy.ts).
  // 서버에서 읽으면 루트 레이아웃 전체가 동적 렌더링이 되므로 클라이언트에서 확인한다.
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    setUnlocked(document.cookie.split("; ").some((c) => c === "wr_ui=1"));
  }, []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <nav className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4">
      {[...TABS, ...(unlocked ? PRIVATE_TABS : [])].map((t) => {
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
