"use client";

// 수도광열비 — 검침자료(.xls)·고지서 값을 넣으면 회입분 엑셀 4개를 채워 준다. 계산·엑셀 작업은 모두 이 브라우저에서.
// 순서: ① 회입분 양식(지난달 파일) ② 원격검침 자료 ③ 고지서 값 ④ 검증 ⑤ 엑셀 만들기 ⑥ 종합표. 근거: 수도광열비_자동화_인수인계.md
import { useCallback, useEffect, useMemo, useState } from "react";
import { KINDS, addMonth, applyFixes, classify, expectedPeriod, meterUsage, parseFeed, parseFixText, runChecks, usageMonth } from "@/lib/utility";
import type { Check, Feed, Fix, Kind, MonthData, UtilityDoc } from "@/lib/utility";
import { billFields, bookKind, carryOver, fillBook, fillSummary, openBook, renameForMonth, templateMeters } from "@/lib/utilityXlsx";
import type { BillField } from "@/lib/utilityXlsx";

const input = "rounded border border-slate-300 px-2 py-1 text-sm";
const btn = "rounded-md bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40";
const ghost = "rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40";
const kstMonth = (n = 0) => addMonth(new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7), n);
const serialToDate = (n: number) => new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
const EMPTY_MONTH: MonthData = { feeds: [], inputs: {} };

async function uploadFile(file: File | Blob, name: string): Promise<string> {
  const { upload } = await import("@vercel/blob/client");
  const b = await upload(`utility/${Date.now()}-${name.replace(/[^\w.가-힣-]+/g, "_")}`, file, { access: "public", handleUploadUrl: "/api/blob-upload", contentType: "application/octet-stream" });
  return b.url;
}
const getBytes = async (url: string) => new Uint8Array(await (await fetch(url, { cache: "no-store" })).arrayBuffer());
const decode = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);
function download(bytes: Uint8Array | string, name: string, type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

type Loaded = { feed?: Feed; tpl?: Uint8Array; fields: BillField[]; carry: Record<string, number>; tplMeters: ReturnType<typeof templateMeters> };

export default function UtilityPage() {
  const [doc, setDoc] = useState<UtilityDoc | null>(null);
  const [month, setMonth] = useState(kstMonth(-1)); // 사용월 — 보통 지난달
  const [data, setData] = useState<MonthData>(EMPTY_MONTH);
  const [loaded, setLoaded] = useState<Partial<Record<Kind, Loaded>>>({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<Kind>("전기");

  const reload = useCallback(async () => setDoc(await (await fetch("/api/utility", { cache: "no-store" })).json()), []);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (doc) setData(doc.months[month] ?? EMPTY_MONTH); }, [doc, month]);

  // 양식·검침자료를 내려받아 읽어 둔다
  useEffect(() => {
    if (!doc) return;
    let alive = true;
    (async () => {
      const next: Partial<Record<Kind, Loaded>> = {};
      for (const k of KINDS) {
        const t = doc.templates[k];
        const f = data.feeds.find((x) => x.kind === k);
        try {
          const tpl = t ? await getBytes(t.url) : undefined;
          const book = tpl ? openBook(tpl) : null;
          const fields = book ? billFields(book) : [];
          // 양식이 이미 이 달 것(⑤를 한 번 누른 뒤 다시 만들 때)이면 전월지침이 이미 맞으므로 당월→전월로 밀지 않는다
          next[k] = { tpl, fields, carry: t?.month === month ? {} : carryOver(fields), tplMeters: book ? templateMeters(book, k) : [], feed: f ? parseFeed(decode(await getBytes(f.url)), f.file) : undefined };
        } catch (e) {
          next[k] = { fields: [], carry: {}, tplMeters: [] };
          setMsg(`${k}: 파일을 읽지 못했습니다 — ${(e as Error).message}`);
        }
      }
      if (alive) setLoaded(next);
    })();
    return () => { alive = false; };
  }, [doc, data.feeds, month]);

  const save = async (patch: Partial<MonthData>) => {
    const next = { ...data, ...patch };
    setData(next);
    const r = await fetch("/api/utility", { method: "PUT", body: JSON.stringify({ op: "month", month, data: next }) });
    if (r.ok) setDoc(await r.json()); else setMsg("저장하지 못했습니다.");
  };

  // ① 회입분 양식 올리기 — 시트 구성으로 어느 항목인지 알아낸다
  async function onTemplates(files: FileList | null) {
    if (!files?.length) return;
    setBusy("tpl"); setMsg("");
    try {
      for (const f of [...files]) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const kind = bookKind(openBook(bytes)) ?? (f.name.includes("종합표") ? "종합" : null);
        if (!kind) { setMsg(`${f.name}: 회입분·종합표 파일이 아닙니다.`); continue; }
        const url = await uploadFile(f, f.name);
        const m = f.name.match(/(\d{4})\.(\d{2})월/);
        await fetch("/api/utility", { method: "PUT", body: JSON.stringify({ op: "template", kind, template: { url, name: f.name, month: m ? `${m[1]}-${m[2]}` : month } }) });
      }
      await reload();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(""); }
  }

  // ② 원격검침 자료 올리기 — 파일명이 아니라 머리글·기간으로 항목을 가린다
  async function onFeeds(files: FileList | null) {
    if (!files?.length) return;
    setBusy("feed"); setMsg("");
    try {
      let feeds = [...data.feeds];
      const notes: string[] = [];
      for (const f of [...files]) {
        if (f.name.endsWith(".txt")) { // 보정.txt 를 같이 올리면 보정표에 합친다
          const add = parseFixText(await f.text());
          if (add.length && doc) await saveFixes([...doc.fixes.filter((x) => !add.some((a) => a.kind === x.kind && a.meter === x.meter)), ...add]);
          continue;
        }
        const feed = parseFeed(await f.text(), f.name);
        const kind = classify(feed);
        const um = usageMonth(kind, feed);
        if (um !== month) notes.push(`${f.name}: ${kind} ${um} 사용분 자료입니다 (지금 ${month})`);
        const url = await uploadFile(f, f.name);
        feeds = [...feeds.filter((x) => x.kind !== kind), { kind, file: f.name, url, from: feed.from, to: feed.to }];
      }
      await save({ feeds });
      setMsg(notes.join(" / "));
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(""); }
  }

  async function saveFixes(fixes: Fix[]) {
    const r = await fetch("/api/utility", { method: "PUT", body: JSON.stringify({ op: "fixes", fixes }) });
    if (r.ok) setDoc(await r.json()); else setMsg("보정표를 저장하지 못했습니다 (사유는 꼭 적어 주세요).");
  }

  const checks = useMemo(() => {
    if (!doc) return [] as Check[];
    const out: Check[] = [];
    for (const k of KINDS) {
      const L = loaded[k];
      if (!L?.feed) { out.push({ level: "경고", kind: k, text: "원격검침 자료가 아직 없습니다." }); continue; }
      if (!L.tpl) out.push({ level: "경고", kind: k, text: "회입분 양식이 없어 고지서 칸·계량기 목록을 확인할 수 없습니다." });
      const meters = applyFixes(k, L.feed.meters, doc.fixes).meters;
      const inputs = data.inputs[k] ?? {};
      const bill = (key: string) => { const v = inputs[key]; return v !== undefined && v !== "" ? Number(v) || 0 : L.carry[key] ?? L.fields.find((x) => x.key === key)?.last ?? 0; };
      out.push(...runChecks({ kind: k, month, feed: L.feed, meters, tpl: L.tplMeters, bill, prev: doc.months[addMonth(month, -1)]?.usage?.[k], lastYear: doc.months[addMonth(month, -12)]?.usage?.[k] }));
    }
    return out;
  }, [doc, loaded, data.inputs, month]);

  // ⑤ 회입분 만들기 — 채운 파일을 내려받고, 다음 달 양식으로 올려 둔다
  async function build(kinds: Kind[]) {
    if (!doc) return;
    setBusy("build"); setMsg("");
    const usage = { ...(data.usage ?? {}) }, done = { ...(data.done ?? {}) }, notes: string[] = [];
    try {
      for (const k of kinds) {
        const L = loaded[k], t = doc.templates[k];
        if (!L?.tpl || !L.feed || !t) { notes.push(`${k}: 양식·검침자료가 모두 있어야 합니다`); continue; }
        const inputs: Record<string, number | string> = { ...L.carry, ...(data.inputs[k] ?? {}) };
        const r = fillBook(L.tpl, k, month, L.feed, doc.fixes, inputs, { blankMeters: !!data.blank?.[k] });
        const name = renameForMonth(t.name, month);
        download(r.bytes, name);
        const url = await uploadFile(new Blob([r.bytes as BlobPart]), name);
        await fetch("/api/utility", { method: "PUT", body: JSON.stringify({ op: "template", kind: k, template: { url, name, month } }) });
        usage[k] = meterUsage(k, applyFixes(k, L.feed.meters, doc.fixes).meters);
        done[k] = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16);
        notes.push(`${k}: ${r.filled}칸 채움${r.missing.length ? `, 검침자료에 없는 계량기 ${r.missing.length}개` : ""}${r.applied.length ? `, 보정 ${r.applied.length}건` : ""}`);
      }
      await save({ usage, done });
      await reload();
      setMsg(notes.join(" / ") + " — 엑셀로 열면 수식이 다시 계산됩니다. 작성방법 시트의 미검침분을 확인하세요.");
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(""); }
  }

  // ⑥ 종합표 — 엑셀에서 열어 저장한 회입분(계산된 값이 들어 있음)에서 값을 옮긴다
  async function buildSummary(files: FileList | null) {
    const t = doc?.templates.종합;
    if (!files?.length || !t) return;
    setBusy("sum"); setMsg("");
    try {
      const saved = await Promise.all([...files].map(async (f) => new Uint8Array(await f.arrayBuffer())));
      const r = fillSummary(await getBytes(t.url), saved, month, (k) => expectedPeriod(k, month));
      const name = renameForMonth(t.name, month);
      download(r.bytes, name);
      const url = await uploadFile(new Blob([r.bytes as BlobPart]), name);
      await fetch("/api/utility", { method: "PUT", body: JSON.stringify({ op: "template", kind: "종합", template: { url, name, month } }) });
      await reload();
      setMsg(r.notes.join(" / "));
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(""); }
  }

  if (!doc) return <p className="p-6 text-sm text-slate-500">불러오는 중…</p>;
  const errors = checks.filter((c) => c.level === "오류").length;

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">수도광열비</h1>
          <p className="text-sm text-slate-500">검침자료와 고지서 값을 넣으면 회입분 엑셀 4개(전기·열·수도·중수)를 채워 줍니다.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">사용월
          <input type="month" className={input} value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </header>
      {msg && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{msg}</p>}

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-bold">① 회입분 양식 <span className="text-xs font-normal text-slate-500">— 지난달에 만든 회입분 엑셀. 한 번 올리면 이후로는 여기서 만든 파일이 자동으로 다음 달 양식이 됩니다.</span></h2>
        <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {([...KINDS, "종합"] as const).map((k) => <div key={k}><b className="inline-block w-10">{k}</b> {doc.templates[k] ? <>{doc.templates[k]!.name} <span className="text-slate-400">({doc.templates[k]!.month})</span></> : <span className="text-red-600">없음</span>}</div>)}
        </div>
        <input type="file" accept=".xlsx" multiple className="mt-2 text-sm" disabled={!!busy} onChange={(e) => onTemplates(e.target.files)} />
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-bold">② 원격검침 자료 <span className="text-xs font-normal text-slate-500">— 원격검침 프로그램에서 받은 .xls 4개 (파일명은 상관없음). 보정.txt 를 같이 올리면 보정표에 들어갑니다.</span></h2>
        <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {KINDS.map((k) => { const f = data.feeds.find((x) => x.kind === k), L = loaded[k]; return (
            <div key={k}><b className="inline-block w-10">{k}</b> {f ? <>{f.from} ~ {f.to} <span className="text-slate-400">· 계량기 {L?.feed?.meters.length ?? "…"}개</span></> : <span className="text-red-600">없음</span>}</div>); })}
        </div>
        <input type="file" accept=".xls,.xml,.txt" multiple className="mt-2 text-sm" disabled={!!busy} onChange={(e) => onFeeds(e.target.files)} />
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-bold">③ 고지서 값 <span className="text-xs font-normal text-slate-500">— 회색 글씨는 지난달 값. 비워 두면 지난달 값(전월지침은 지난달 당월지침)이 그대로 들어갑니다.</span></h2>
        <div className="mt-2 flex gap-1">{KINDS.map((k) => <button key={k} className={k === open ? btn : ghost} onClick={() => setOpen(k)}>{k}</button>)}</div>
        {(() => {
          const L = loaded[open];
          if (!L?.fields.length) return <p className="mt-3 text-sm text-slate-500">회입분 양식을 올리면 입력 칸이 나옵니다.</p>;
          const cur = data.inputs[open] ?? {};
          const set = (key: string, v: string, date: boolean) => setData({ ...data, inputs: { ...data.inputs, [open]: { ...cur, [key]: v === "" ? "" : date ? v : Number(v) } } });
          return (
            <>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {L.fields.map((f) => {
                  const def = L.carry[f.key] ?? f.last;
                  return (
                    <label key={f.key} className="flex items-center gap-2 text-sm">
                      <span className="w-48 shrink-0 truncate" title={`${f.label} (${f.key})`}>{f.label}</span>
                      <input className={input + " w-36 text-right"} type={f.date ? "date" : "number"} step="any" value={cur[f.key] ?? ""}
                        placeholder={f.date ? serialToDate(def) : String(def)} onChange={(e) => set(f.key, e.target.value, f.date)} />
                      <span className="truncate text-xs text-slate-400">{f.date ? serialToDate(f.last) : f.last.toLocaleString("ko-KR")}</span>
                    </label>
                  );
                })}
              </div>
              {open === "중수" && (
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!data.blank?.중수} onChange={(e) => setData({ ...data, blank: { ...data.blank, 중수: e.target.checked } })} />
                  이번 달은 검침값 대신 면적지분율로 배분 (원격검침 칸을 비움 — 미검침분이 음수일 때)
                </label>
              )}
              <button className={btn + " mt-3"} onClick={() => save({}).then(() => setMsg("저장했습니다."))}>저장</button>
            </>
          );
        })()}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-bold">④ 검증 {errors ? <span className="ml-1 rounded bg-red-100 px-2 text-sm text-red-700">오류 {errors}</span> : <span className="ml-1 rounded bg-emerald-100 px-2 text-sm text-emerald-700">오류 없음</span>}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {checks.map((c, i) => (
            <li key={i} className={c.level === "오류" ? "text-red-700" : c.level === "경고" ? "text-amber-700" : "text-slate-600"}>
              <b>[{c.kind}] {c.level}</b> {c.text}
              {c.detail && <details className="ml-4 text-xs text-slate-500"><summary>{c.detail.length}개 보기</summary>{c.detail.map((d) => <div key={d}>{d}</div>)}</details>}
            </li>
          ))}
        </ul>
      </section>

      <FixTable fixes={doc.fixes} onSave={saveFixes} />

      <section className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-4">
        <button className={btn} disabled={!!busy} onClick={() => build(KINDS)}>{busy === "build" ? "만드는 중…" : "⑤ 회입분 엑셀 4개 만들기"}</button>
        {KINDS.map((k) => <button key={k} className={ghost} disabled={!!busy} onClick={() => build([k])}>{k}만</button>)}
        <button className={ghost} onClick={() => download(JSON.stringify({ month, ...data, fixes: doc.fixes, templates: doc.templates }, null, 1), `수도광열비_${month}.json`, "application/json")}>JSON 내려받기</button>
        {data.done && <span className="text-xs text-slate-500">만든 시각: {KINDS.filter((k) => data.done?.[k]).map((k) => `${k} ${data.done![k]!.replace("T", " ")}`).join(" · ")}</span>}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-bold">⑥ 종합표 <span className="text-xs font-normal text-slate-500">— ⑤에서 받은 회입분 4개를 엑셀로 열어 저장(Ctrl+S)한 뒤 여기에 올리면, 각 사 사용량·요금과 고지서 금액·기간을 종합표에 옮겨 내려받습니다.</span></h2>
        {doc.templates.종합
          ? <input type="file" accept=".xlsx" multiple className="mt-2 text-sm" disabled={!!busy} onChange={(e) => { buildSummary(e.target.files); e.target.value = ""; }} />
          : <p className="mt-2 text-sm text-red-600">① 에 지난달 종합표(파일명에 「종합표」)를 먼저 올려 주세요.</p>}
        {busy === "sum" && <p className="mt-1 text-sm text-slate-500">만드는 중…</p>}
      </section>
    </main>
  );
}

function FixTable({ fixes, onSave }: { fixes: Fix[]; onSave: (f: Fix[]) => void }) {
  const [rows, setRows] = useState(fixes);
  useEffect(() => setRows(fixes), [fixes]);
  const set = (i: number, p: Partial<Fix>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const n = (v: string) => (v === "" ? undefined : Number(v));
  return (
    <section className="rounded-xl border bg-white p-4">
      <h2 className="font-bold">보정표 <span className="text-xs font-normal text-slate-500">— 계량기가 틀리게 재는 경우. 계량률(%)을 적으면 사용량을 역산해 종료지침을 다시 만듭니다. 사유는 꼭 적어 주세요.</span></h2>
      <div className="mt-2 space-y-1 overflow-x-auto">
        {rows.map((r, i) => (
          <div key={i} className="flex min-w-[720px] items-center gap-1 text-sm">
            <select className={input} value={r.kind} onChange={(e) => set(i, { kind: e.target.value as Kind })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            <input className={input + " w-52"} placeholder="계량기명 (검침자료의 호)" value={r.meter} onChange={(e) => set(i, { meter: e.target.value })} />
            <input className={input + " w-20 text-right"} placeholder="계량률%" value={r.rate ? +(r.rate * 100).toFixed(2) : ""} onChange={(e) => set(i, { rate: e.target.value ? Number(e.target.value) / 100 : undefined })} />
            <input className={input + " w-20 text-right"} placeholder="시작" value={r.start ?? ""} onChange={(e) => set(i, { start: n(e.target.value) })} />
            <input className={input + " w-20 text-right"} placeholder="종료" value={r.end ?? ""} onChange={(e) => set(i, { end: n(e.target.value) })} />
            <input className={input + " flex-1"} placeholder="사유 (필수)" value={r.reason} onChange={(e) => set(i, { reason: e.target.value })} />
            <button className="px-1 text-slate-400 hover:text-red-600" onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="삭제">✕</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button className={ghost} onClick={() => setRows([...rows, { kind: "수도", meter: "", reason: "" }])}>+ 줄 추가</button>
        <button className={btn} onClick={() => onSave(rows)}>보정표 저장</button>
      </div>
    </section>
  );
}
