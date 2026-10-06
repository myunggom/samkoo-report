"use client";

// 실비 청구 — 반복 점검을 한 번 등록하면 달마다 「청구 전」 항목이 생기고, 입주사 비율대로 금액이 나뉜다.
// 놓친 청구(지난달 이전 「청구 전」)는 맨 위에 빨갛게, 아침 텔레그램 브리핑에도 뜬다. 계산은 lib/billing.ts.

import { useEffect, useMemo, useState } from "react";
import { STATUS_LABEL, addMonth, monthItems, noTaxItems, pendingItems, splitAmount } from "@/lib/billing";
import type { BillingDoc, BillingItem, BillingRule, BillingStatus, Share } from "@/lib/billing";

const won = (n: number) => n.toLocaleString("ko-KR");
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const num = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;
const PRESETS: [string, number[]][] = [["매월", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]], ["분기", [3, 6, 9, 12]], ["반기", [6, 12]], ["연 1회", [12]]];
const input = "rounded border border-slate-300 px-2 py-1 text-sm";
// 청구 달 짧게: 매월 / 분기(3·6·9·12월) / 반기(6·12월) / 3·7월
function monthsLabel(ms: number[]): string {
  const k = ms.join(",");
  if (ms.length === 12) return "매월";
  const list = ms.join("·") + "월";
  return k === "3,6,9,12" ? `분기(${list})` : k === "6,12" ? `반기(${list})` : ms.length === 1 ? `연 1회(${list})` : list;
}

export default function BillingPage() {
  const [doc, setDoc] = useState<BillingDoc | null>(null);
  const [month, setMonth] = useState(kstToday().slice(0, 7));
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/billing", { cache: "no-store" }).then((r) => r.json()).then(setDoc).catch(() => setMsg("불러오지 못했습니다."));
  }, []);

  async function put(body: object) {
    setMsg("");
    const res = await fetch("/api/billing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(d.error || "저장하지 못했습니다.");
    setDoc(d);
  }

  const items = useMemo(() => (doc ? monthItems(doc, month) : []), [doc, month]);
  const pending = useMemo(() => (doc ? pendingItems(doc, kstToday().slice(0, 7)).filter((i) => i.month < kstToday().slice(0, 7)) : []), [doc]);
  const noTax = useMemo(() => (doc ? noTaxItems(doc) : []), [doc]);
  if (!doc) return <p className="text-sm text-slate-400">{msg || "불러오는 중…"}</p>;
  const shares = doc.shares;
  const pctSum = shares.reduce((a, s) => a + s.pct, 0);
  const totals = shares.map((_, k) => items.reduce((a, i) => a + splitAmount(i.amount, shares)[k], 0));
  const sum = items.reduce((a, i) => a + i.amount, 0);

  const saveItem = (i: BillingItem, patch: Partial<BillingItem>) => {
    const next = { ...i, ...patch };
    if (patch.status === "billed" && !next.billedOn) next.billedOn = kstToday();
    if (patch.status === "paid" && !next.paidOn) next.paidOn = kstToday();
    put({ op: "item", item: next });
  };

  function copyText() {
    const [y, m] = month.split("-");
    const lines = [`[${y}년 ${Number(m)}월 실비 청구] (VAT 별도)`, ...items.map((i) => `- ${i.name}${i.inspectedOn ? ` (${i.inspectedOn} 점검)` : ""}: ${won(i.amount)}원`), `합계: ${won(sum)}원`, "",
      ...shares.map((s, k) => `${s.name} ${s.pct}%: ${won(totals[k])}원`)];
    navigator.clipboard.writeText(lines.join("\n")).then(() => setMsg("청구 내용을 복사했습니다. 메일·메신저에 붙여 넣으세요."));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-bold text-slate-900">실비 청구</h1>
        <button className="rounded border px-2 py-1 text-sm" onClick={() => setMonth(addMonth(month, -1))} aria-label="이전 달">◀</button>
        <input type="month" className={input} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <button className="rounded border px-2 py-1 text-sm" onClick={() => setMonth(addMonth(month, 1))} aria-label="다음 달">▶</button>
      </div>
      {msg && <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{msg}</p>}

      {noTax.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          <b>세금계산서 미발행 {noTax.length}건</b> — 청구는 했지만 세금계산서 체크가 안 된 항목
          <ul className="mt-1 space-y-0.5">
            {noTax.map((i) => (
              <li key={i.id}><button className="underline" onClick={() => setMonth(i.month)}>{i.month}</button> {i.name} · {won(i.amount)}원</li>
            ))}
          </ul>
        </div>
      )}
      {pending.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <b>놓친 청구 {pending.length}건</b> — 지난달 이전에 「청구 전」으로 남은 항목
          <ul className="mt-1 space-y-0.5">
            {pending.map((i) => (
              <li key={i.id}><button className="underline" onClick={() => setMonth(i.month)}>{i.month}</button> {i.name} · {won(i.amount)}원</li>
            ))}
          </ul>
        </div>
      )}

      <section className="rounded-lg border bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">{month.replace("-", "년 ")}월 청구 <span className="text-xs font-normal text-slate-500">(금액은 VAT 별도)</span></h2>
          <button className="rounded border px-2 py-1 text-sm" onClick={() => put({ op: "item", item: { month, name: "새 항목", amount: 0, status: "todo" } })}>+ 이번 달만 항목 추가</button>
          <button className="rounded bg-slate-900 px-3 py-1 text-sm font-semibold text-white disabled:opacity-40" disabled={!items.length} onClick={copyText}>청구 내용 복사</button>
        </div>
        {shares.length === 0 || Math.abs(pctSum - 100) > 1e-9 ? (
          <p className="mb-2 text-sm text-red-700">분담 비율을 먼저 맞춰 주세요(합계 100%). 아래 「분담 비율」에서 설정합니다.</p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse whitespace-nowrap text-sm">
            <thead><tr className="bg-slate-100 text-left">
              <th className="p-2">상태</th><th className="p-2">항목</th><th className="p-2">점검일</th><th className="p-2">세금계산서</th><th className="p-2 text-right">금액</th>
              {shares.map((s) => <th key={s.name} className="p-2 text-right">{s.name} {s.pct}%</th>)}<th className="p-2" />
            </tr></thead>
            <tbody>
              {items.map((i) => {
                const parts = splitAmount(i.amount, shares);
                return (
                  <tr key={i.id} className={"border-t " + (i.status === "todo" ? "bg-amber-50/40" : "")}>
                    <td className="p-2">
                      <select className={input} value={i.status} onChange={(e) => saveItem(i, { status: e.target.value as BillingStatus })} aria-label="상태">
                        {(Object.keys(STATUS_LABEL) as BillingStatus[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
                      </select>
                    </td>
                    <td className="p-2"><div className="flex items-center gap-1">
                      <input className={input + " w-44"} defaultValue={i.name} onBlur={(e) => e.target.value !== i.name && saveItem(i, { name: e.target.value })} aria-label="항목" />
                      {i.ruleId && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">반복</span>}</div></td>
                    <td className="p-2"><input type="date" className={input} defaultValue={i.inspectedOn} onBlur={(e) => e.target.value !== (i.inspectedOn ?? "") && saveItem(i, { inspectedOn: e.target.value })} aria-label="점검일" /></td>
                    <td className="p-2 whitespace-nowrap">
                      <label className="flex items-center gap-1"><input type="checkbox" checked={!!i.taxOn} disabled={i.virtual && !i.amount}
                        onChange={(e) => saveItem(i, { taxOn: e.target.checked ? kstToday() : undefined })} aria-label="세금계산서 발행" />
                        <span className="text-xs text-slate-500">{i.taxOn ?? "미발행"}</span></label>
                    </td>
                    <td className="p-2 text-right"><input className={input + " w-28 text-right"} inputMode="numeric" defaultValue={won(i.amount)} onBlur={(e) => num(e.target.value) !== i.amount && saveItem(i, { amount: num(e.target.value) })} aria-label="금액" /></td>
                    {parts.map((v, k) => <td key={k} className="p-2 text-right tabular-nums">{won(v)}</td>)}
                    <td className="p-2 text-right">
                      <button className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => i.ruleId
                          ? confirm(`${i.month} 「${i.name}」을 이 달 청구에서 뺄까요? (반복 점검은 그대로, 다음 달부터 계속 생깁니다)`) && saveItem(i, { skip: true })
                          : confirm(`「${i.name}」 항목을 삭제할까요?`) && put({ op: "deleteItem", id: i.id })}>삭제</button>
                    </td>
                  </tr>
                );
              })}
              {!items.length && <tr><td colSpan={6 + shares.length} className="p-3 text-center text-slate-400">이 달 청구 항목이 없습니다.</td></tr>}
              {items.length > 0 && (
                <tr className="border-t bg-slate-50 font-semibold">
                  <td className="p-2" colSpan={4}>합계</td><td className="p-2 text-right tabular-nums">{won(sum)}</td>
                  {totals.map((t, k) => <td key={k} className="p-2 text-right tabular-nums">{won(t)}</td>)}<td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Rules rules={doc.rules} month={month} put={put} />
      <Shares shares={shares} put={put} />
    </div>
  );
}

function Rules({ rules, month, put }: { rules: BillingRule[]; month: string; put: (b: object) => void }) {
  const blank: BillingRule = { id: "", name: "", amount: 0, months: [], from: month, active: true };
  const [edit, setEdit] = useState<BillingRule | null>(null);
  return (
    <section className="rounded-lg border bg-white p-3">
      <div className="mb-2 flex items-center">
        <h2 className="mr-auto font-semibold">반복 점검 <span className="text-xs font-normal text-slate-500">— 등록하면 해당 달마다 청구 항목이 자동으로 생깁니다</span></h2>
        <button className="rounded border px-2 py-1 text-sm" onClick={() => setEdit(blank)}>+ 등록</button>
      </div>
      <ul className="divide-y text-sm">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center gap-2 py-1.5">
            {/* 한 줄로 — 길면 말줄임, 마우스를 올리면 전체 */}
            <span title={`${r.name} · ${won(r.amount)}원 · ${monthsLabel(r.months)} · ${r.from}부터${r.until ? ` ${r.until}까지` : ""}`}
              className={"min-w-0 flex-1 truncate whitespace-nowrap " + (r.active ? "" : "text-slate-400 line-through")}>
              <b>{r.name}</b> · {won(r.amount)}원 · {monthsLabel(r.months)} · {r.from}~{r.until ?? ""}</span>
            <button className="shrink-0 text-slate-500 underline" onClick={() => setEdit(r)}>수정</button>
            <button className="shrink-0 rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50" onClick={() => confirm(`「${r.name}」 반복 점검을 삭제할까요? (이미 저장된 달의 청구 항목은 남습니다)`) && put({ op: "deleteRule", id: r.id })}>삭제</button>
          </li>
        ))}
        {!rules.length && <li className="py-2 text-slate-400">아직 없습니다. 승강기·저수조·소독처럼 정기적으로 청구하는 점검을 등록하세요.</li>}
      </ul>
      {edit && (
        <div className="mt-3 space-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <input className={input + " w-48"} placeholder="점검 이름" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <input className={input + " w-36"} placeholder="업체(선택)" value={edit.vendor ?? ""} onChange={(e) => setEdit({ ...edit, vendor: e.target.value })} />
            <input className={input + " w-32 text-right"} inputMode="numeric" placeholder="금액(VAT 별도)" value={edit.amount ? won(edit.amount) : ""} onChange={(e) => setEdit({ ...edit, amount: num(e.target.value) })} />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {PRESETS.map(([label, ms]) => <button key={label} className="rounded border bg-white px-2 py-0.5" onClick={() => setEdit({ ...edit, months: ms })}>{label}</button>)}
            <span className="mx-1 text-slate-300">|</span>
            {Array.from({ length: 12 }, (_, k) => k + 1).map((m) => (
              <button key={m} className={"w-9 rounded border px-1 py-0.5 " + (edit.months.includes(m) ? "bg-slate-900 text-white" : "bg-white")}
                onClick={() => setEdit({ ...edit, months: edit.months.includes(m) ? edit.months.filter((x) => x !== m) : [...edit.months, m] })}>{m}월</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label>시작 <input type="month" className={input} value={edit.from} onChange={(e) => setEdit({ ...edit, from: e.target.value })} /></label>
            <label>끝(선택) <input type="month" className={input} value={edit.until ?? ""} onChange={(e) => setEdit({ ...edit, until: e.target.value || undefined })} /></label>
            <label><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> 사용</label>
            <button className="ml-auto rounded bg-slate-900 px-3 py-1 font-semibold text-white disabled:opacity-40" disabled={!edit.name.trim() || !edit.months.length}
              onClick={() => { put({ op: "rule", rule: { ...edit, id: edit.id || undefined } }); setEdit(null); }}>저장</button>
            <button className="rounded border px-3 py-1" onClick={() => setEdit(null)}>취소</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Shares({ shares, put }: { shares: Share[]; put: (b: object) => void }) {
  const [rows, setRows] = useState<Share[]>(shares);
  useEffect(() => setRows(shares), [shares]);
  const sum = rows.reduce((a, s) => a + (s.pct || 0), 0);
  return (
    <section className="rounded-lg border bg-white p-3 text-sm">
      <h2 className="mb-2 font-semibold">분담 비율 <span className="text-xs font-normal text-slate-500">— 끝전(원 단위)은 비율이 가장 큰 입주사에 붙습니다</span></h2>
      <div className="space-y-1">
        {rows.map((s, k) => (
          <div key={k} className="flex gap-2">
            <input className={input + " w-40"} value={s.name} placeholder="입주사" onChange={(e) => setRows(rows.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} />
            <input className={input + " w-20 text-right"} inputMode="decimal" value={s.pct || ""} placeholder="%" onChange={(e) => setRows(rows.map((x, j) => (j === k ? { ...x, pct: Number(e.target.value) || 0 } : x)))} />
            <button className="text-slate-400 hover:text-red-600" onClick={() => setRows(rows.filter((_, j) => j !== k))} aria-label="삭제">✕</button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button className="underline" onClick={() => setRows([...rows, { name: "", pct: 0 }])}>+ 입주사</button>
        <span className={Math.abs(sum - 100) < 1e-9 ? "text-emerald-700" : "text-red-600"}>합계 {sum}%</span>
        <button className="ml-auto rounded bg-slate-900 px-3 py-1 font-semibold text-white disabled:opacity-40" disabled={Math.abs(sum - 100) > 1e-9} onClick={() => put({ op: "shares", shares: rows })}>비율 저장</button>
      </div>
    </section>
  );
}
