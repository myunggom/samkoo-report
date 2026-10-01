"use client";

// 고객사 일일 업무일지 — 입력 → 미리보기 → PDF. 메일은 보내지 않는다(받은 PDF를 직접 발송).
import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyLog, MeterKey, People, WorkEntry } from "@/lib/dailyLog";
import { METERS, POWER_PARTS, TEAMS, WORK_SLOTS, dateLabel, draftFor, fmt, meterRows, solarFromMonthTotal, sumParts } from "@/lib/dailyLog";
import { kstDateString } from "@/lib/tasks";
import DailyLogDocument, { MonthlyLogDocument } from "@/components/DailyLogDocument";
import { elementToPdfBlobFlow, shareOrDownloadFile, shareOrDownloadPdf } from "@/lib/pdf";

type MeterText = Partial<Record<MeterKey, string>>;
const EMPTY_PEOPLE: People = { to: [0, 0, 0, 0], actual: [0, 0, 0, 0], off: 0, leave: 0 };

const input = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";
const area = input + " min-h-[4.5rem] leading-snug";

export default function DailyLogPage() {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => kstDateString(new Date()));
  const [draft, setDraft] = useState<DailyLog | null>(null);
  const [meterText, setMeterText] = useState<MeterText>({});
  const [parts, setParts] = useState<string[]>(["", "", ""]); // 전력량계 3요소
  const [solarMwh, setSolarMwh] = useState(""); // 태양광 금월 발전량(MWh)
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const pdfRef = useRef<HTMLDivElement>(null);
  const monthRef = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch("/api/daily-log", { cache: "no-store" });
    setLogs(res.ok ? await res.json() : []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  // 날짜가 바뀌면(또는 처음 불러오면) 초안을 새로 만든다
  useEffect(() => {
    if (loading) return;
    const d = draftFor(logs, date);
    setDraft(structuredClone(d));
    setMeterText(Object.fromEntries(METERS.map((m) => [m.key, d.meters[m.key]?.toString() ?? ""])));
    setParts(d.powerParts ? d.powerParts.map(String) : ["", "", ""]);
    setSolarMwh(d.solarMonthMWh?.toString() ?? "");
    setDirty(false);
    // logs 는 저장 직후에도 바뀌지만 그때 입력 중인 초안을 덮어쓰면 안 되므로 date·loading 만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, loading]);

  const saved = logs.some((l) => l.date === date);

  // 미리보기·PDF는 저장 전 입력값을 반영한다
  const current: DailyLog | null = useMemo(() => {
    if (!draft) return null;
    const meters: DailyLog["meters"] = {};
    for (const m of METERS) {
      const v = Number(meterText[m.key]);
      if (meterText[m.key]?.trim() && Number.isFinite(v)) meters[m.key] = v;
    }
    // 3요소가 다 들어오면 그 합이 전력 지침. 덜 들어왔으면 예전에 저장된 전력 지침을 그대로 둔다
    const nums = parts.map((s) => (s.trim() === "" ? NaN : Number(s)));
    const full = nums.every((n) => Number.isFinite(n));
    if (full) meters.power = sumParts(nums);
    // 태양광: 금월 발전량(MWh)을 넣으면 오늘 발전량(kWh)으로 바꿔 넣는다. 안 넣었으면 예전 값 유지
    const mwh = solarMwh.trim() === "" ? NaN : Number(solarMwh);
    const hasSolar = Number.isFinite(mwh) && mwh >= 0;
    if (hasSolar) meters.solar = solarFromMonthTotal(logs, draft.date, mwh);
    return { ...draft, meters, powerParts: full ? nums : undefined, solarMonthMWh: hasSolar ? mwh : undefined };
  }, [draft, meterText, parts, solarMwh, logs]);
  // 3요소 칸 안내용: 지난 기록의 3요소 값
  const prevParts = useMemo(
    () => [...logs].filter((l) => l.date < date && l.powerParts).sort((a, b) => b.date.localeCompare(a.date))[0]?.powerParts,
    [logs, date],
  );
  const merged = useMemo(() => (current ? [...logs.filter((l) => l.date !== current.date), current] : logs), [logs, current]);
  const rows = useMemo(() => (current ? meterRows(merged, current.date) : []), [merged, current]);

  function edit(patch: Partial<DailyLog>) {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  }
  function editWork(key: string, patch: WorkEntry) {
    setDraft((d) => (d ? { ...d, work: { ...d.work, [key]: { ...d.work[key], ...patch } } } : d));
    setDirty(true);
  }
  function editPeople(patch: Partial<People>) {
    setDraft((d) => (d ? { ...d, people: { ...(d.people ?? EMPTY_PEOPLE), ...patch } } : d));
    setDirty(true);
  }
  function changeDate(v: string) {
    if (dirty && !confirm("저장하지 않은 내용이 있습니다. 날짜를 바꿀까요?")) return;
    setDate(v);
  }

  async function save(): Promise<boolean> {
    if (!current) return false;
    setBusy("save");
    setMsg("");
    try {
      const res = await fetch("/api/daily-log", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: [current] }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(d.error || "저장에 실패했습니다.");
        return false;
      }
      setLogs(merged);
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

  async function exportPdf(kind: "day" | "month") {
    // 보낸 PDF와 저장본이 달라지지 않게, 일일 PDF는 저장부터 한다
    if (kind === "day" && (dirty || !saved) && !(await save())) return;
    const el = kind === "day" ? pdfRef.current : monthRef.current;
    if (!el) return;
    setBusy(kind);
    try {
      const blob = await elementToPdfBlobFlow(el, { orientation: "portrait" });
      const name = kind === "day" ? `삼구INC 일일업무일지_${date}.pdf` : `삼구INC 월간업무일지_${date.slice(0, 7)}.pdf`;
      await shareOrDownloadPdf(blob, name);
    } catch {
      setMsg("PDF를 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy("");
    }
  }

  // 예전 엑셀과 같은 월별 파일(날짜별 시트) — 화면에 입력 중인 오늘 값도 들어간다
  async function exportXlsx() {
    setBusy("xlsx");
    try {
      const month = date.slice(0, 7);
      const [{ buildMonthXlsx }, tpl] = await Promise.all([
        import("@/lib/dailyLogXlsx"),
        fetch("/daily-log-template.xlsx").then((r) => r.arrayBuffer()),
      ]);
      const bytes = buildMonthXlsx(tpl, merged, month);
      const type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      await shareOrDownloadFile(new Blob([bytes as BlobPart], { type }), `삼구INC 일일업무일지_${month.replace("-", ".")}.xlsx`, type);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "엑셀을 만들지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  if (loading || !draft || !current) return <p className="text-sm text-slate-400">불러오는 중…</p>;
  const p = draft.people ?? EMPTY_PEOPLE;
  const warnings = rows.filter((r) => r.warn);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-bold text-slate-900">일일 업무일지</h1>
        <input type="date" value={date} onChange={(e) => e.target.value && changeDate(e.target.value)} className={input + " w-auto"} />
        <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (saved && !dirty ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
          {saved ? (dirty ? "수정 중" : "저장됨") : "새 일지"}
        </span>
      </div>
      {!saved && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
          인원과 비고는 지난 일지에서, 금일 업무는 지난 일지의 <b>명일 계획</b>에서 미리 채웠습니다. 바뀐 부분만 고치세요.
        </p>
      )}

      {/* 계량 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-bold">계량 (금일 지침)</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {rows.map((r) => r.def.key === "solar" ? (
            <label key="solar" className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 text-slate-600">태양광 금월<br /><span className="text-xs">(MWh)</span></span>
              <input
                inputMode="decimal"
                value={solarMwh}
                onChange={(e) => {
                  setSolarMwh(e.target.value);
                  setDirty(true);
                }}
                placeholder={`어제까지 ${fmt((r.prev ?? 0) / 1000, 3)}`}
                className={input + (r.warn ? " border-red-400 bg-red-50" : "")}
              />
              <span className="w-24 shrink-0 text-right text-xs text-slate-500">
                {r.today === null ? "" : `오늘 ${fmt(r.today, 1)} kWh`}
              </span>
            </label>
          ) : r.def.key === "power" ? (
            <div key="power" className="rounded-lg bg-slate-50 p-2 text-sm sm:col-span-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-slate-700">전력량계 (3요소 지침)</span>
                <span className="text-xs text-slate-500">
                  합계 {r.today === null ? "—" : fmt(r.today)} · 전일 {fmt(r.prev)}
                  {r.usage !== null && <b className="ml-1 text-slate-800">→ 사용 {fmt(r.usage, 0)} kWh</b>}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {POWER_PARTS.map((label, i) => (
                  <label key={label} className="text-xs text-slate-500">
                    {label}
                    <input
                      inputMode="decimal"
                      value={parts[i]}
                      onChange={(e) => {
                        setParts((ps) => ps.map((x, j) => (j === i ? e.target.value : x)));
                        setDirty(true);
                      }}
                      placeholder={prevParts ? `전일 ${fmt(prevParts[i])}` : ""}
                      className={input + (r.warn ? " border-red-400 bg-red-50" : "")}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <label key={r.def.key} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 text-slate-600">{r.def.label}</span>
              <input
                inputMode="decimal"
                value={meterText[r.def.key] ?? ""}
                onChange={(e) => {
                  setMeterText((t) => ({ ...t, [r.def.key]: e.target.value }));
                  setDirty(true);
                }}
                placeholder={r.def.daily ? "그날 발전량" : `전일 ${fmt(r.prev)}`}
                className={input + (r.warn ? " border-red-400 bg-red-50" : "")}
              />
              <span className="w-24 shrink-0 text-right text-xs text-slate-500">
                {r.def.daily ? "" : r.usage === null ? "" : `사용 ${fmt(r.usage, r.def.factor ? 0 : 2)}`}
              </span>
            </label>
          ))}
        </div>
        {warnings.map((r) => (
          <p key={r.def.key} className="mt-2 text-sm font-semibold text-red-600">⚠ {r.def.label}: {r.warn} — 지침을 다시 확인하세요.</p>
        ))}
      </section>

      {/* 인원 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-bold">인원</h2>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-slate-500">
                <th className="pr-2 text-left font-medium" />
                {TEAMS.map((t) => <th key={t} className="px-1 font-medium">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {(["to", "actual"] as const).map((k) => (
                <tr key={k}>
                  <td className="pr-2 text-slate-600">{k === "to" ? "T O" : "실근무"}</td>
                  {TEAMS.map((t, i) => (
                    <td key={t} className="px-1 py-0.5">
                      <input
                        inputMode="numeric"
                        value={p[k][i] ?? 0}
                        onChange={(e) => editPeople({ [k]: p[k].map((x, j) => (j === i ? Number(e.target.value) || 0 : x)) })}
                        className={input + " w-16 text-center"}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1">비번 <input inputMode="numeric" value={p.off} onChange={(e) => editPeople({ off: Number(e.target.value) || 0 })} className={input + " w-14 text-center"} /></label>
          <label className="flex items-center gap-1">휴가 <input inputMode="numeric" value={p.leave} onChange={(e) => editPeople({ leave: Number(e.target.value) || 0 })} className={input + " w-14 text-center"} /></label>
          <label className="flex min-w-48 flex-1 items-center gap-1">비고 <input value={p.note ?? ""} onChange={(e) => editPeople({ note: e.target.value })} className={input} /></label>
        </div>
      </section>

      {/* 업무 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 font-bold">업무</h2>
        <div className="space-y-4">
          {WORK_SLOTS.map((s) => {
            const e = draft.work[s.key] ?? {};
            return (
              <div key={s.key} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <div className="mb-1 text-sm font-bold text-slate-700">{s.key.startsWith("미화") ? "미화 · " + s.label : s.label}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <textarea value={e.today ?? ""} onChange={(ev) => editWork(s.key, { today: ev.target.value })} placeholder="금일 업무 내용" className={area} />
                  <textarea value={e.plan ?? ""} onChange={(ev) => editWork(s.key, { plan: ev.target.value })} placeholder="명일 업무 계획" className={area} />
                  {s.extra && (
                    <textarea value={e.extra ?? ""} onChange={(ev) => editWork(s.key, { extra: ev.target.value })} placeholder="추가 줄 (협력업체 작업 등, 선택)" className={input + " sm:col-span-2"} rows={2} />
                  )}
                  {s.note && (
                    // 비고는 "담당자\n직급\n업무지원" 처럼 여러 줄이라 textarea (input 은 줄바꿈을 지운다)
                    <textarea value={e.note ?? ""} onChange={(ev) => editWork(s.key, { note: ev.target.value })} placeholder="비고 (담당자 등)" className={input + " sm:col-span-2"} rows={2} />
                  )}
                </div>
              </div>
            );
          })}
          <div className="border-t border-slate-100 pt-3">
            <div className="mb-1 text-sm font-bold text-slate-700">특이사항</div>
            <textarea value={draft.special ?? ""} onChange={(e) => edit({ special: e.target.value })} className={area} />
          </div>
        </div>
      </section>

      {/* 버튼 — 폰에서 스크롤 없이 누를 수 있게 하단 고정 */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button onClick={save} disabled={!!busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy === "save" ? "저장 중…" : "저장"}
        </button>
        <button onClick={() => exportPdf("day")} disabled={!!busy} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy === "day" ? "PDF 만드는 중…" : "일일 PDF 받기"}
        </button>
        <button onClick={() => exportPdf("month")} disabled={!!busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
          {busy === "month" ? "만드는 중…" : `${Number(date.slice(5, 7))}월 월간 PDF`}
        </button>
        <button onClick={exportXlsx} disabled={!!busy} className="rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-50">
          {busy === "xlsx" ? "만드는 중…" : `${Number(date.slice(5, 7))}월 엑셀`}
        </button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>

      {/* 미리보기 (PDF와 같은 문서) */}
      <section>
        <h2 className="mb-2 font-bold">미리보기 — {dateLabel(date)}</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-3">
          <div className="mx-auto w-fit shadow">
            <DailyLogDocument logs={merged} log={current} />
          </div>
        </div>
      </section>

      {/* PDF 캡처용 원본 — 화면 밖에 그대로(축소 없이) 둔다 */}
      <div aria-hidden style={{ position: "fixed", left: -10000, top: 0 }}>
        <div ref={pdfRef}><DailyLogDocument logs={merged} log={current} /></div>
        <div ref={monthRef}><MonthlyLogDocument logs={merged} month={date.slice(0, 7)} /></div>
      </div>
    </div>
  );
}
