"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 보고서 탭 안의 작은 탭 — 보고서 / 매뉴얼
const SUB = [
  {
    href: "/reports",
    label: "보고서",
    match: (p: string) => p.startsWith("/reports") || p.startsWith("/report/") || p.startsWith("/pungsuhae"),
  },
  { href: "/manuals", label: "매뉴얼", match: (p: string) => p.startsWith("/manuals") },
];

export default function ReportTabs() {
  const pathname = usePathname() || "/";
  return (
    <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
      {SUB.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              "rounded-lg px-4 py-1.5 text-sm font-semibold transition " +
              (active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
