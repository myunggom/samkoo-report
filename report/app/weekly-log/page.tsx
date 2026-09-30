"use client";

// 고객사 주간 업무 보고 — 그 주 일일 업무일지로 초안 → 고쳐서 저장 → PDF 받아 직접 발송.
import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyLog } from "@/lib/dailyLog";
import type { WeeklyLog } from "@/lib/weeklyLog";
import { WEEK_SLOTS, compileFromDaily, draftWeekly, periodLabel } from "@/lib/weeklyLog";
import { kstDateString } from "@/lib/tasks";
import WeeklyLogDocument from "@/components/WeeklyLogDocument";
import { elementToPdfBlobFlow, shareOrDownloadPdf } from "@/lib/pdf";

const input = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";
const area = input + " min-h-[7rem] leading-snug";

export default function WeeklyLogPage() {
  const [weeklies, setWeeklies] = useState<WeeklyLog[]>([]);
  const [dailies, setDailies] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => kstDateString(new Date()));
  const [draft, setDraft] = useState<WeeklyLog | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const pdfRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/weekly-log", { cache: "no-store" });
      const d = res.ok ? await res.json() : { weeklies: [], dailies: [] };
      setWeeklies(d.weeklies);
      setDailies(d.dailies);
      setLoading(false);
    })();
  }, []);

  // 보고일이 바뀌면 초안을 새로 만든다 (저장된 주는 저장본)
  useEffect(() => {
    if (loading) return;
    setDraft(structuredClone(draftWeekly(weeklies, dailies, date)));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, loading]);

  const saved = weeklies.some((w) => w.date === date);
  const daysInRange = useMemo(
    () => (draft ? dailies.filter((d) => d.date >= draft.thisFrom && d.date <= draft.thisTo).length : 0),
    [dailies, draft],
  );

  function edit(patch: Partial<WeeklyLog>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  }
  function editWork(key: string, field: "done" | "plan", value: string) {
    setDraft((d) => (d ? { ...d, work: { ...d.work, [key]: { ...d.work[key], [field]: value } } } : d));
    setDirty(true);
  }
  function changeDate(v: string) {
    if (dirty && !confirm("저장하지 않은 내용이 있습니다. 보고일을 바꿀까요?")) return;
    setDate(v);
  }
  function refill() {
    if (!draft) return;
    if (!confirm(`${periodLabel(draft.thisFrom, draft.thisTo)} 일일 업무일지 ${daysInRange}일치로 내용을 다시 채울까요? 지금 입력한 내용은 바뀝니다.`)) return;
    edit({ work: compileFromDaily(dailies, draft.thisFrom, draft.thisTo) });
  }

  async function save(): Promise<boolean> {
    if (!draft) return false;
    setBusy("save");
    setMsg("");
    try {
      const res = await fetch("/api/weekly-log", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeklies: [draft] }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.error || "저장에 실패했습니다.");
        return false;
      }
      setWeeklies((ws) => [...ws.filter((w) => w.date !== draft.date), draft]);
      setDirty(false);
      setMsg("저장했습니다.");
      return true;
    } catch {
      setMsg("네트워크 오류로 저장하지 못했습니다. 입력한 내용은 그대로 있습니다.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function exportPdf() {
    if ((dirty || !saved) && !(await save())) return; // 보낸 PDF와 저장본이 같게
    if (!pdfRef.current) return;
    setBusy("pdf");
    try {
      const blob = await elementToPdfBlobFlow(pdfRef.current, { orientation: "portrait" });
      await shareOrDownloadPdf(blob, `[주간업무보고] 바이오 이노베이션 허브_${date.replaceAll("-", ".")}.pdf`);
    } catch {
      setMsg("PDF를 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  }

  if (loading || !draft) return <p className="text-sm text-slate-400">불러오는 중…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-bold text-slate-900">주간 업무 보고</h1>
        <label className="text-sm text-slate-600">보고일</label>
        <input type="date" value={date} onChange={(e) => e.target.value && changeDate(e.target.value)} className={input + " w-auto"} />
        <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (saved && !dirty ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
          {saved ? (dirty ? "수정 중" : "저장됨") : "새 보고"}
        </span>
      </div>
      {!saved && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
          이번주 업무는 이 기간 <b>일일 업무일지 {daysInRange}일치</b>를 분야별로 모았고, 다음주 계획은 마지막 일지의 명일 계획입니다.
          일지가 없는 분야는 지난주 보고의 다음주 계획을 옮겼습니다. 다듬어서 저장하세요.
        </p>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-bold">기간</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="mb-1 text-slate-600">이번주 업무수행</div>
            <div className="flex items-center gap-1">
              <input type="date" value={draft.thisFrom} onChange={(e) => e.target.value && edit({ thisFrom: e.target.value })} className={input} />
              ~
              <input type="date" value={draft.thisTo} onChange={(e) => e.target.value && edit({ thisTo: e.target.value })} className={input} />
            </div>
          </div>
          <div>
            <div className="mb-1 text-slate-600">다음주 업무 계획</div>
            <div className="flex items-center gap-1">
              <input type="date" value={draft.nextFrom} onChange={(e) => e.target.value && edit({ nextFrom: e.target.value })} className={input} />
              ~
              <input type="date" value={draft.nextTo} onChange={(e) => e.target.value && edit({ nextTo: e.target.value })} className={input} />
            </div>
          </div>
        </div>
        <button onClick={refill} className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700">
          일일 업무일지에서 다시 채우기 ({daysInRange}일치)
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-bold">분야별 업무</h2>
        <div className="space-y-4">
          {WEEK_SLOTS.map((s) => (
            <div key={s.key} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
              <div className="mb-1 text-sm font-bold text-slate-700">{s.key}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <textarea value={draft.work[s.key]?.done ?? ""} onChange={(e) => editWork(s.key, "done", e.target.value)} placeholder="이번주 업무수행" className={area} />
                <textarea value={draft.work[s.key]?.plan ?? ""} onChange={(e) => editWork(s.key, "plan", e.target.value)} placeholder="다음주 업무 계획" className={area} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button onClick={save} disabled={!!busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy === "save" ? "저장 중…" : "저장"}
        </button>
        <button onClick={exportPdf} disabled={!!busy} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy === "pdf" ? "PDF 만드는 중…" : "주간 PDF 받기"}
        </button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>

      <section>
        <h2 className="mb-2 font-bold">미리보기</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-3">
          <div className="mx-auto w-fit shadow">
            <WeeklyLogDocument log={draft} />
          </div>
        </div>
      </section>

      <div aria-hidden style={{ position: "fixed", left: -10000, top: 0 }}>
        <div ref={pdfRef}><WeeklyLogDocument log={draft} /></div>
      </div>
    </div>
  );
}