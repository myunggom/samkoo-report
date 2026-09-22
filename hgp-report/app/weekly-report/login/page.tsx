"use client";

import { useEffect, useState } from "react";

// 오픈 리다이렉트 방지: 내부 경로("/…")만 허용, "//"·외부 URL은 기본값으로
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/weekly-report";
  return raw;
}

export default function WeeklyLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // /tasks에서 넘어왔으면 "주간 업무보고"가 아니라 그 맥락에 맞는 제목을 보여준다
  const [forTasks, setForTasks] = useState(false);
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next") || "";
    setForTasks(next.startsWith("/tasks"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/weekly/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "로그인에 실패했습니다.");
        return;
      }
      const params = new URLSearchParams(window.location.search);
      window.location.assign(safeNext(params.get("next")));
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-bold text-slate-900">
          🔒 {forTasks ? "개인 업무 관리" : "주간 업무보고"}
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          {forTasks ? "본인 전용 페이지입니다." : "사장님 전용 페이지입니다."} 비밀번호를 입력하세요.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? "확인 중…" : "들어가기"}
          </button>
        </form>
      </div>
    </div>
  );
}
