"use client";

// 고객사 월간 보고서 — 지난달 복사 초안 → 바뀐 칸만 고쳐 저장 → 전체 PDF 받아 직접 발송.
import { useEffect, useRef, useState } from "react";
import type { MonthlyReport, Staff } from "@/lib/monthlyReport";
import {
  COVER_SLOTS, ENERGY, SHIFT_CYCLE, TRADES, addMonths, daysIn, draftMonthly, holidaysOf, isShift, monthLabel, scheduleRow, weekday,
} from "@/lib/monthlyReport";
import type { WeeklyLog } from "@/lib/weeklyLog";
import { joinItems, splitItems } from "@/lib/weeklyLog";
import { kstDateString } from "@/lib/tasks";
import { proxied, uploadPhoto } from "@/lib/client";
import ArchivePicker from "@/components/ArchivePicker";
import MonthlyReportDocument from "@/components/MonthlyReportDocument";
import { pagesToPdfBlob, shareOrDownloadPdf } from "@/lib/pdf";

const input = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";
const area = input + " min-h-[5rem] leading-snug";
const btn = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-50";
const TABS = ["표지", "교육·조직도", "에너지", "고객사", "시설실적", "작업사진", "차월계획", "근무표"] as const;
type Tab = (typeof TABS)[number];

// 사진 한 칸: 촬영 / 앨범 / 아카이브
// 미리보기: 세로(794)·가로(1123) 페이지를 각각 화면 폭에 맞춰 줄인다. PDF 는 숨긴 원본 크기로 만든다.
function Preview({ report }: { report: MonthlyReport }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const z = (px: number) => (w ? Math.min(1, w / px) : 1);
  return (
    <div ref={ref} className="mr-preview rounded-xl border border-slate-200 bg-slate-100 p-3" style={{ "--zp": z(794), "--zl": z(1123) } as React.CSSProperties}>
      <style>{`.mr-preview .mr-page{zoom:var(--zp);margin:0 auto 12px;box-shadow:0 1px 4px #0003}.mr-preview .mr-page[data-landscape="1"]{zoom:var(--zl)}`}</style>
      <MonthlyReportDocument report={report} />
    </div>
  );
}

function PhotoSlot({ url, onChange, label }: { url?: string; onChange: (u?: string) => void; label?: string }) {
  const cam = useRef<HTMLInputElement>(null);
  const alb = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);
  async function up(files: FileList | null) {
    if (!files?.[0]) return;
    setBusy(true);
    try { onChange(await uploadPhoto(files[0])); } catch { alert("사진 업로드에 실패했습니다."); } finally { setBusy(false); }
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-1.5">
      <div className="relative aspect-[4/3] overflow-hidden rounded bg-slate-50">
        {url ? <img src={proxied(url)} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-slate-300">{busy ? "업로드 중…" : label ?? "사진 없음"}</div>}
        {url && <button onClick={() => onChange(undefined)} className="absolute right-1 top-1 h-6 w-6 rounded-full bg-black/60 text-sm text-white">×</button>}
      </div>
      <div className="mt-1 grid grid-cols-3 gap-1 text-[11px]">
        <button onClick={() => cam.current?.click()} className="rounded bg-slate-900 py-1 text-white">📷</button>
        <button onClick={() => alb.current?.click()} className="rounded border border-slate-300 py-1">🖼</button>
        <button onClick={() => setPick(true)} className="rounded border border-slate-300 py-1">🗂</button>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => up(e.target.files)} />
      <input ref={alb} type="file" accept="image/*" className="hidden" onChange={(e) => up(e.target.files)} />
      {pick && <ArchivePicker onClose={() => setPick(false)} onPick={(it) => { onChange(it.url); setPick(false); }} />}
    </div>
  );
}

// 여러 줄 표 편집 (행 추가·삭제)
function Rows<T extends Record<string, string>>({ rows, cols, onChange, blank }: {
  rows: T[]; cols: { key: keyof T; label: string; w?: string; select?: string[] }[]; onChange: (r: T[]) => void; blank: T;
}) {
  const set = (i: number, k: keyof T, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-1">
          {cols.map((c) => c.select ? (
            <select key={String(c.key)} value={r[c.key]} onChange={(e) => set(i, c.key, e.target.value)} className={input + " " + (c.w ?? "")}>
              {c.select.map((o) => <option key={o} value={o}>{o || "-"}</option>)}
            </select>
          ) : (
            <input key={String(c.key)} value={r[c.key] ?? ""} placeholder={c.label} onChange={(e) => set(i, c.key, e.target.value)} className={input + " " + (c.w ?? "")} />
          ))}
          <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="shrink-0 px-2 text-slate-400">×</button>
        </div>
      ))}
      <button onClick={() => onChange([...rows, { ...blank }])} className={btn}>+ 행 추가</button>
    </div>
  );
}

export default function MonthlyReportPage() {
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [weeklies, setWeeklies] = useState<WeeklyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => kstDateString(new Date()).slice(0, 7));
  const [d, setD] = useState<MonthlyReport | null>(null);
  const [tab, setTab] = useState<Tab>("표지");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [trade, setTrade] = useState<string>(TRADES[0]);
  const [preview, setPreview] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/monthly-report", { cache: "no-store" });
      const j = res.ok ? await res.json() : { reports: [], weeklies: [] };
      setReports(j.reports);
      setWeeklies(j.weeklies);
      setLoading(false);
    })();
  }, []);
  useEffect(() => {
    if (loading) return;
    setD(structuredClone(draftMonthly(reports, month)));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, loading]);

  if (loading || !d) return <p className="text-sm text-slate-400">불러오는 중…</p>;
  const saved = reports.some((r) => r.month === month);
  const nextMonth = addMonths(month, 1);
  const up = (patch: Partial<MonthlyReport>) => { setD({ ...d, ...patch }); setDirty(true); };

  function changeMonth(v: string) {
    if (dirty && !confirm("저장하지 않은 내용이 있습니다. 보고월을 바꿀까요?")) return;
    setMonth(v);
  }

  // 표지 당월·차월: 그 달 주간보고의 이번주 업무 / 마지막 주간보고의 다음주 계획
  function fillCover() {
    const ws = weeklies.filter((w) => w.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
    if (!ws.length) return alert(`${monthLabel(month)} 주간보고가 없습니다.`);
    if (!confirm(`${monthLabel(month)} 주간보고 ${ws.length}건으로 당월·차월 실시 사항을 다시 채울까요? (보안은 그대로)`)) return;
    const last = ws[ws.length - 1];
    const cover = { ...d!.cover };
    for (const k of COVER_SLOTS) {
      if (k === "보안") continue;
      cover[k] = { now: joinItems(ws.flatMap((w) => splitItems(w.work[k]?.done))) || cover[k]?.now, next: joinItems(splitItems(last.work[k]?.plan)) || cover[k]?.next };
    }
    up({ cover });
  }
  async function aiCover() {
    setBusy("ai");
    try {
      const work = Object.fromEntries(COVER_SLOTS.filter((k) => k !== "보안").map((k) => [k, { done: d!.cover[k]?.now ?? "", plan: d!.cover[k]?.next ?? "" }]));
      const res = await fetch("/api/weekly-log/summarize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ work }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(j.error || "요약 실패");
      const cover = { ...d!.cover };
      for (const [k, e] of Object.entries(j.work as Record<string, { done?: string; plan?: string }>)) cover[k] = { now: e.done || cover[k]?.now, next: e.plan || cover[k]?.next };
      up({ cover });
      setMsg("AI가 표지 실시 사항을 요약했습니다. 확인하고 저장하세요.");
    } finally { setBusy(""); }
  }

  async function save(): Promise<boolean> {
    setBusy("save"); setMsg("");
    try {
      const res = await fetch("/api/monthly-report", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report: d }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error || "저장 실패"); return false; }
      setReports((rs) => [...rs.filter((r) => r.month !== d!.month), d!]);
      setDirty(false); setMsg("저장했습니다."); return true;
    } catch { setMsg("네트워크 오류로 저장하지 못했습니다."); return false; } finally { setBusy(""); }
  }
  async function pdf() {
    if ((dirty || !saved) && !(await save())) return;
    if (!docRef.current) return;
    setBusy("pdf"); setMsg("PDF 만드는 중… (사진이 많으면 1분 정도)");
    try {
      const blob = await pagesToPdfBlob(docRef.current, ".mr-page");
      await shareOrDownloadPdf(blob, `[월간보고서] 바이오 이노베이션 허브_${month.replace("-", ".")}.pdf`);
      setMsg("");
    } catch { setMsg("PDF를 만들지 못했습니다. 다시 시도해 주세요."); } finally { setBusy(""); }
  }

  const setEnergy = (k: string, field: string, i: number, v: string) => {
    const e = { ...d.energy[k as keyof typeof d.energy] } as Record<string, unknown>;
    const arr = [...(e[field] as (number | null)[])];
    const num = Number(v.replace(/,/g, ""));
    arr[i] = v.trim() === "" || !Number.isFinite(num) ? null : num;
    e[field] = arr;
    up({ energy: { ...d.energy, [k]: e } });
  };
  const setStaff = (i: number, patch: Partial<Staff>) => up({ staff: d.staff.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const cycleCell = (name: string, date: string, cur: string) => {
    const order = ["주", "야", "비", "휴", "연", ""];
    const nextV = order[(order.indexOf(cur) + 1) % order.length];
    up({ overrides: { ...d.overrides, [name]: { ...(d.overrides[name] ?? {}), [date]: nextV || " " } } });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-bold text-slate-900">월간 보고서</h1>
        <input type="month" value={month} onChange={(e) => e.target.value && changeMonth(e.target.value)} className={input + " w-auto"} />
        <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (saved && !dirty ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>{saved ? (dirty ? "수정 중" : "저장됨") : "새 보고서"}</span>
      </div>
      {!saved && <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">지난달 보고서를 복사했습니다. 표지 당월 사항은 지난달 차월 사항, 작업사진은 작업명만 남기고 사진을 비웠고, 근무표는 {monthLabel(nextMonth)} 공휴일·교대 주기로 새로 만들었습니다.</p>}

      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => <button key={t} onClick={() => setTab(t)} className={"shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold " + (tab === t ? "bg-slate-900 text-white" : "bg-white text-slate-600 border border-slate-200")}>{t}</button>)}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        {tab === "표지" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button onClick={fillCover} className={btn}>주간보고에서 채우기</button>
              <button onClick={aiCover} disabled={!!busy} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{busy === "ai" ? "AI 요약 중…" : "✨ AI 요약"}</button>
            </div>
            {COVER_SLOTS.map((k) => (
              <div key={k}><div className="mb-1 text-sm font-bold">{k}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <textarea value={d.cover[k]?.now ?? ""} placeholder="당월 실시 사항" onChange={(e) => up({ cover: { ...d.cover, [k]: { ...d.cover[k], now: e.target.value } } })} className={area} />
                  <textarea value={d.cover[k]?.next ?? ""} placeholder="차월 실시 사항" onChange={(e) => up({ cover: { ...d.cover, [k]: { ...d.cover[k], next: e.target.value } } })} className={area} />
                </div></div>
            ))}
            <div className="max-w-xs"><div className="mb-1 text-sm font-bold">표지 사진 (보통 고정)</div><PhotoSlot url={d.coverImage} onChange={(u) => up({ coverImage: u })} /></div>
          </div>
        )}

        {tab === "교육·조직도" && (
          <div className="space-y-4">
            <div className="text-sm font-bold">1-1. 교육 실시 내역</div>
            <Rows rows={d.education.rows} onChange={(rows) => up({ education: { ...d.education, rows } })}
              blank={{ name: "", org: "", trainees: "", date: "", place: "", note: "" }}
              cols={[{ key: "name", label: "교육명", w: "flex-[3]" }, { key: "org", label: "교육기관" }, { key: "trainees", label: "피교육생" }, { key: "date", label: "일자 2026-09-15" }, { key: "place", label: "위치" }, { key: "note", label: "비고" }]} />
            <div className="text-sm font-bold">1-2. 교육 현장 사진</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[0, 1, 2, 3].map((i) => d.education.photos[i] ?? {}).map((p, i) => (
                <div key={i}><PhotoSlot url={p.url} label={["교육자료", "회의록", "교육 사진", "안전상황판"][i]} onChange={(u) => up({ education: { ...d.education, photos: [0, 1, 2, 3].map((j) => (j === i ? { ...d.education.photos[j], url: u } : d.education.photos[j] ?? {})) } })} />
                  <input value={p.caption ?? ""} placeholder={["교육자료", "회의록", "교육 사진", "안전상황판"][i]} onChange={(e) => up({ education: { ...d.education, photos: [0, 1, 2, 3].map((j) => (j === i ? { ...d.education.photos[j], caption: e.target.value } : d.education.photos[j] ?? {})) } })} className={input + " mt-1 text-xs"} /></div>
              ))}
            </div>
            <div className="max-w-sm"><div className="mb-1 text-sm font-bold">1-3. 조직도 (날짜는 보고월 1일로 자동)</div><PhotoSlot url={d.orgImage} onChange={(u) => up({ orgImage: u })} /></div>
          </div>
        )}

        {tab === "에너지" && (
          <div className="space-y-5">
            <p className="text-xs text-slate-500">{monthLabel(month)} 보고서에는 {monthLabel(addMonths(month, -1))}분까지 들어갑니다. 증감·일평균·㎡당은 자동 계산됩니다.</p>
            {ENERGY.map((e) => (
              <div key={e.key} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <div className="mb-1 text-sm font-bold">{e.no}. {e.label} ({e.unit})</div>
                <div className="overflow-x-auto">
                  <table className="text-xs"><tbody>
                    <tr><td /> {Array.from({ length: 12 }, (_, i) => <td key={i} className="px-0.5 text-center text-slate-500">{i + 1}월</td>)}</tr>
                    {([["usage", `사용량 ${month.slice(0, 4)}`], ["cost", `요금(원) ${month.slice(0, 4)}`], ["prevUsage", "사용량 작년"], ["prevCost", "요금 작년"]] as const).map(([f, label]) => (
                      <tr key={f}><td className="pr-1 whitespace-nowrap text-slate-600">{label}</td>
                        {d.energy[e.key][f].map((v, i) => <td key={i} className="px-0.5"><input inputMode="decimal" value={v ?? ""} onChange={(ev) => setEnergy(e.key, f, i, ev.target.value)} className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right" /></td>)}
                      </tr>
                    ))}
                  </tbody></table>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <textarea value={d.energy[e.key].usageNote ?? ""} placeholder="사용량 특이사항" onChange={(ev) => up({ energy: { ...d.energy, [e.key]: { ...d.energy[e.key], usageNote: ev.target.value } } })} className={area} />
                  <textarea value={d.energy[e.key].costNote ?? ""} placeholder="요금 특이사항" onChange={(ev) => up({ energy: { ...d.energy, [e.key]: { ...d.energy[e.key], costNote: ev.target.value } } })} className={area} />
                </div>
                <input value={d.costNotes[e.key] ?? ""} placeholder="2-1 광열비 증감분석 (비우면 '전년대비 증감 분석 불가')" onChange={(ev) => up({ costNotes: { ...d.costNotes, [e.key]: ev.target.value } })} className={input + " mt-2"} />
              </div>
            ))}
          </div>
        )}

        {tab === "고객사" && (
          <div className="space-y-4">
            <div className="max-w-sm"><div className="mb-1 text-sm font-bold">3-1. 층별 고객사 현황 (그림)</div><PhotoSlot url={d.tenantsImage} onChange={(u) => up({ tenantsImage: u })} /></div>
            <div className="text-sm font-bold">3-2. 고객사 연락처 (담당자 바뀔 때만)</div>
            <Rows rows={d.contacts} onChange={(contacts) => up({ contacts })} blank={{ tenant: "", floor: "", person: "", tel: "", mobile: "", count: "", note: "" }}
              cols={[{ key: "tenant", label: "입주사" }, { key: "floor", label: "층", w: "w-16" }, { key: "person", label: "담당자" }, { key: "tel", label: "연락처" }, { key: "mobile", label: "H.P" }, { key: "count", label: "인원", w: "w-16" }, { key: "note", label: "비고" }]} />
          </div>
        )}

        {tab === "시설실적" && (
          <Rows rows={d.facility as unknown as Record<string, string>[]} onChange={(rows) => up({ facility: rows as unknown as MonthlyReport["facility"] })}
            blank={{ group: "", sub: "", content: "", status: "완료", note: "매월" }}
            cols={[{ key: "group", label: "구분", w: "w-20" }, { key: "sub", label: "세부", w: "w-28" }, { key: "content", label: "내용", w: "flex-[4]" }, { key: "status", label: "진행", w: "w-24", select: ["완료", "진행중", "계획중", ""] }, { key: "note", label: "비고", w: "w-20" }]} />
        )}

        {tab === "작업사진" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1">{TRADES.map((t) => <button key={t} onClick={() => setTrade(t)} className={"rounded-full px-3 py-1 text-sm " + (trade === t ? "bg-sky-600 text-white" : "border border-slate-300")}>{t} ({(d.photos[t] ?? []).filter((s) => s.a || s.b).length}/12)</button>)}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 12 }, (_, i) => (d.photos[trade] ?? [])[i] ?? { name: "" }).map((s, i) => {
                const set = (patch: Partial<typeof s>) => { const arr = Array.from({ length: 12 }, (_, j) => (d.photos[trade] ?? [])[j] ?? { name: "" }); arr[i] = { ...arr[i], ...patch }; up({ photos: { ...d.photos, [trade]: arr } }); };
                return (
                  <div key={i} className="rounded-xl border border-slate-200 p-2">
                    <div className="mb-1 text-xs text-slate-500">{trade} {i + 1}</div>
                    <div className="grid grid-cols-2 gap-1"><PhotoSlot url={s.a} onChange={(u) => set({ a: u })} /><PhotoSlot url={s.b} onChange={(u) => set({ b: u })} /></div>
                    <input value={s.name} placeholder="작업명" onChange={(e) => set({ name: e.target.value })} className={input + " mt-1"} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "차월계획" && (
          <Rows rows={d.nextPlan} onChange={(nextPlan) => up({ nextPlan })} blank={{ group: "", content: "", when: "", note: "" }}
            cols={[{ key: "group", label: "구분", w: "w-20" }, { key: "content", label: "작업 내용", w: "flex-[4]" }, { key: "when", label: "예정일", w: "w-28" }, { key: "note", label: "비고", w: "w-24" }]} />
        )}

        {tab === "근무표" && (
          <div className="space-y-3">
            <div className="text-sm">{monthLabel(nextMonth)} 근무표 · 공휴일
              <input value={d.holidays.map((h) => Number(h.slice(8))).join(", ")} onChange={(e) => up({ holidays: e.target.value.split(/[,\s]+/).map((x) => Number(x)).filter((x) => x >= 1 && x <= 31).map((x) => `${nextMonth}-${String(x).padStart(2, "0")}`) })}
                className={input + " ml-2 inline-block w-48"} placeholder="3, 5, 9" />
              <button onClick={() => up({ holidays: holidaysOf(nextMonth) })} className={btn + " ml-2"}>기본값</button>
            </div>
            <p className="text-xs text-slate-500">칸을 누르면 주→야→비→휴→연→빈칸 순으로 바뀝니다(연차 등). 교대기사는 1일 근무를 고르면 주주야야비비로 자동 순환합니다.</p>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead><tr><th className="px-1">부서</th><th className="px-1">성명</th><th className="px-1">직급</th><th className="px-1">투입일자</th><th className="px-1">교대(1일)</th>
                  {daysIn(nextMonth).map((dd) => { const w = weekday(dd); return <th key={dd} className={"w-6 " + (w === 0 || d.holidays.includes(dd) ? "text-red-600" : w === 6 ? "text-blue-700" : "")}>{Number(dd.slice(8))}</th>; })}<th /></tr></thead>
                <tbody>
                  {d.staff.map((s, i) => {
                    const row = scheduleRow(s, nextMonth, d.holidays, d.overrides[s.name]);
                    return (
                      <tr key={i}>
                        <td><input value={s.dept} onChange={(e) => setStaff(i, { dept: e.target.value })} className="w-12 rounded border px-1" /></td>
                        <td><input value={s.name} onChange={(e) => setStaff(i, { name: e.target.value })} className="w-16 rounded border px-1" /></td>
                        <td><input value={s.title} onChange={(e) => setStaff(i, { title: e.target.value })} className="w-24 rounded border px-1" /></td>
                        <td><input type="date" value={s.start ?? ""} onChange={(e) => setStaff(i, { start: e.target.value })} className="w-28 rounded border px-1" /></td>
                        <td><select value={isShift(s) ? String(s.shift) : ""} onChange={(e) => setStaff(i, { shift: e.target.value === "" ? undefined : Number(e.target.value) })} className="rounded border">
                          <option value="">일반</option>{SHIFT_CYCLE.map((c, k) => <option key={k} value={k}>{c}{"①②③④⑤⑥"[k]}</option>)}</select></td>
                        {row.map((v, j) => <td key={j}><button onClick={() => cycleCell(s.name, daysIn(nextMonth)[j], v.trim())} className={"h-6 w-6 rounded " + (v === "휴" ? "bg-slate-100" : v === "야" ? "bg-amber-100" : v === "연" ? "bg-rose-100" : "")}>{v}</button></td>)}
                        <td><button onClick={() => up({ staff: d.staff.filter((_, j) => j !== i) })} className="px-1 text-slate-400">×</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button onClick={() => up({ staff: [...d.staff, { group: d.staff.at(-1)?.group ?? "", dept: "시설", title: "", to: 1, name: "새 인원" }] })} className={btn}>+ 인원 추가</button>
          </div>
        )}
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button onClick={save} disabled={!!busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "save" ? "저장 중…" : "저장"}</button>
        <button onClick={pdf} disabled={!!busy} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === "pdf" ? "PDF 만드는 중…" : "전체 PDF 받기"}</button>
        <button onClick={() => setPreview((p) => !p)} className={btn}>{preview ? "미리보기 닫기" : "미리보기"}</button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>

      {preview && <Preview report={d} />}
      <div aria-hidden style={{ position: "fixed", left: -20000, top: 0 }}><div ref={docRef}><MonthlyReportDocument report={d} /></div></div>
    </div>
  );
}