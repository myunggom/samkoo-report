"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AHU_UNITS, DAY_LABELS, HVAC_MODES, TENANTS, defaultSettings, diffSettings, sheetUrls,
  settingText, toMin, versionAt, type AhuUnit, type HvacVersion, type UnitSetting,
} from "@/lib/hvac";

// 공조기 가동 스케줄 — 호기별 현재 운전값 · 날짜를 고르면 그때의 운전값 · 변경 이력 ·
// 호기를 누르면 조닝도 팝업. 고치기는 기계과장(비밀번호).

const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

const MODE_STYLE: Record<string, string> = {
  냉방: "bg-sky-100 text-sky-800 border-sky-200",
  난방: "bg-orange-100 text-orange-800 border-orange-200",
  송풍: "bg-emerald-100 text-emerald-800 border-emerald-200",
  정지: "bg-slate-200 text-slate-600 border-slate-300",
  "": "bg-white text-slate-400 border-dashed border-slate-300",
};
const BAR_STYLE: Record<string, string> = {
  냉방: "bg-sky-500", 난방: "bg-orange-500", 송풍: "bg-emerald-500", 정지: "bg-slate-300", "": "bg-slate-400",
};
const TENANT_STYLE: Record<string, string> = {
  공용: "text-slate-500", 프로젠: "text-indigo-700", 제넥신: "text-rose-700", 셀리드: "text-teal-700",
};

function DayBar({ s }: { s: UnitSetting }) {
  // 24시간 막대 — 자정을 넘기는 운전(22:00~06:00)은 두 토막으로
  const a = toMin(s.start), b = toMin(s.end);
  const segs: [number, number][] = s.mode === "정지" || s.days.every((d) => !d) ? []
    : b > a ? [[a, b]] : b < a ? [[a, 1440], [0, b]] : [];
  return (
    <div className="relative h-3 w-full min-w-[120px] rounded-full bg-slate-100" aria-hidden>
      {[6, 12, 18].map((h) => (
        <span key={h} className="absolute top-0 h-3 w-px bg-slate-300" style={{ left: `${(h / 24) * 100}%` }} />
      ))}
      {segs.map(([x, y], i) => (
        <span key={i} className={"absolute top-0 h-3 rounded-full " + BAR_STYLE[s.mode]}
          style={{ left: `${(x / 1440) * 100}%`, width: `${((y - x) / 1440) * 100}%` }} />
      ))}
    </div>
  );
}

function DaysText({ days }: { days: boolean[] }) {
  return (
    <span className="inline-flex gap-0.5">
      {DAY_LABELS.map((d, i) => (
        <span key={d} className={"w-4 text-center text-[11px] " +
          (days[i] ? (i === 5 ? "font-bold text-blue-600" : i === 6 ? "font-bold text-red-600" : "font-bold text-slate-800") : "text-slate-300")}>{d}</span>
      ))}
    </span>
  );
}

function DrawingModal({ unit, s, onClose }: { unit: AhuUnit; s: UnitSetting; onClose: () => void }) {
  const urls = sheetUrls(unit);
  const [i, setI] = useState(0);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6" onClick={onClose} role="dialog" aria-modal aria-label={`AHU-${unit.id} 조닝도`}>
      <div className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-bold text-slate-900">AHU-{unit.id}</h2>
          <span className={"text-sm font-semibold " + TENANT_STYLE[unit.tenant]}>{unit.tenant}</span>
          <span className="text-sm text-slate-600">{unit.zone}</span>
          <span className="text-xs text-slate-500">{settingText(s)}</span>
          <div className="ml-auto flex items-center gap-2">
            {urls.length > 1 && urls.map((_, k) => (
              <button key={k} onClick={() => setI(k)}
                className={"rounded-full border px-3 py-1 text-xs font-semibold " + (k === i ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600")}>
                {k + 1}장
              </button>
            ))}
            <a href={urls[i]} target="_blank" rel="noopener" className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">크게 보기</a>
            <button onClick={onClose} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-200" aria-label="닫기">닫기</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urls[i]} alt={`AHU-${unit.id} 공조 조닝도 ${i + 1}장 — 빗금 친 곳이 이 공조기가 담당하는 구역`} className="mx-auto block h-auto w-full" />
        </div>
        <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">분홍 빗금 친 곳이 이 공조기가 공기를 보내는 구역입니다. (준공도서 「공조기별 조닝도」)</p>
      </div>
    </div>
  );
}

export default function HvacPage() {
  const [versions, setVersions] = useState<HvacVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [date, setDate] = useState(todayKST());
  const [tenant, setTenant] = useState<string>("전체");
  const [open, setOpen] = useState<AhuUnit | null>(null);

  // 편집
  const [pw, setPw] = useState("");
  const [editing, setEditing] = useState(false);
  const [askPw, setAskPw] = useState(false);
  const [draft, setDraft] = useState<Record<string, UnitSetting>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<UnitSetting>({ mode: "", temp: null, days: [true, true, true, true, true, true, true], start: "08:00", end: "18:00" });
  const [meta, setMeta] = useState({ effectiveFrom: todayKST(), by: "기계과장", reason: "" });
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/hvac", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "불러오지 못했습니다.");
      setVersions(j.versions || []);
      setErr("");
    } catch (e) {
      setErr(String((e as Error).message || e));
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const cur = useMemo(() => versionAt(versions, date), [versions, date]);
  const settings = editing ? draft : (cur?.settings ?? defaultSettings());
  const units = AHU_UNITS.filter((u) => tenant === "전체" || u.tenant === tenant);
  const floors = Array.from(new Set(units.map((u) => u.floor)));

  // 이력 : 적용일 순으로 앞 판과 비교
  const history = useMemo(() => {
    const byEff = [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.savedAt.localeCompare(b.savedAt));
    return byEff.map((v, i) => ({ v, diff: diffSettings(i ? byEff[i - 1].settings : null, v.settings) })).reverse();
  }, [versions]);

  async function startEdit(e?: React.FormEvent) {
    e?.preventDefault();
    setMsg("");
    const r = await fetch("/api/hvac", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ check: true, password: pw }) });
    if (!r.ok) { setMsg("비밀번호가 맞지 않습니다."); return; }
    const base = versionAt(versions, todayKST())?.settings ?? defaultSettings();
    setDraft(JSON.parse(JSON.stringify(base)));
    setDate(todayKST());
    setEditing(true);
    setAskPw(false);
    setSel(new Set());
  }
  function setOne(id: string, patch: Partial<UnitSetting>) {
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  }
  function applyBulk() {
    if (!sel.size) { setMsg("먼저 왼쪽 칸을 눌러 호기를 고르세요."); return; }
    setDraft((d) => {
      const n = { ...d };
      sel.forEach((id) => { n[id] = { ...bulk, days: [...bulk.days] }; });
      return n;
    });
    setMsg(`${sel.size}대에 적용했습니다. 아래에서 저장해야 기록됩니다.`);
  }
  async function save() {
    setMsg("");
    if (!meta.reason.trim()) { setMsg("변경 사유를 적어 주세요."); return; }
    setSaving(true);
    const r = await fetch("/api/hvac", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw, settings: draft, ...meta }),
    });
    const j = await r.json().catch(() => ({}));
    setSaving(false);
    if (!r.ok) { setMsg(j.error || "저장하지 못했습니다."); return; }
    setEditing(false);
    setSel(new Set());
    setMeta((m) => ({ ...m, reason: "" }));
    setDate(meta.effectiveFrom > todayKST() ? meta.effectiveFrom : todayKST());
    await load();
    setMsg("저장했습니다. 변경 이력에 남았습니다.");
  }
  const changed = editing ? diffSettings(versionAt(versions, todayKST())?.settings ?? defaultSettings(), draft) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">공조기 가동 스케줄</h1>
          <p className="mt-1 text-sm text-slate-500">바이오 이노베이션 허브 공조기 {AHU_UNITS.length}대 · 호기를 누르면 담당 구역 도면이 뜹니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600" htmlFor="hvac-date">기준일</label>
          <input id="hvac-date" type="date" value={date} disabled={editing} onChange={(e) => setDate(e.target.value || todayKST())}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-100" />
          {date !== todayKST() && !editing && (
            <button onClick={() => setDate(todayKST())} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">오늘</button>
          )}
          {!editing ? (
            <button onClick={() => { setAskPw(true); setMsg(""); }} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">스케줄 변경</button>
          ) : (
            <button onClick={() => { setEditing(false); setSel(new Set()); setMsg(""); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">변경 취소</button>
          )}
        </div>
      </div>

      {askPw && !editing && (
        <form onSubmit={startEdit} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label htmlFor="hvac-pw" className="text-sm text-slate-700">기계과장 비밀번호</label>
          <input id="hvac-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white">확인</button>
          <button type="button" onClick={() => setAskPw(false)} className="text-sm text-slate-500">닫기</button>
        </form>
      )}
      {msg && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{msg}</p>}
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {!editing && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          {loading ? <span className="text-slate-400">불러오는 중…</span>
            : cur ? (
              <span className="text-slate-700">
                <b>{date}</b> 에 적용되던 스케줄 — <b>{cur.effectiveFrom}</b> 부터 적용 · {cur.by} · {cur.reason}
              </span>
            ) : (
              <span className="text-slate-500">{date} 이전에 기록된 스케줄이 없습니다. 아래는 2026년 하절기 기준(매일 11:00~14:00)이며, 모드 · 설정온도는 아직 입력 전입니다.</span>
            )}
        </div>
      )}

      {editing && (
        <div className="space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-3">
          <p className="text-sm font-semibold text-slate-800">여러 대를 한꺼번에 바꾸기 — 표 왼쪽 칸으로 호기를 고른 뒤 적용</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select value={bulk.mode} onChange={(e) => setBulk({ ...bulk, mode: e.target.value as UnitSetting["mode"] })} className="rounded-lg border border-slate-300 px-2 py-1.5" aria-label="모드">
              <option value="">모드</option>
              {HVAC_MODES.map((m) => <option key={m}>{m}</option>)}
            </select>
            <input type="number" step="0.5" placeholder="℃" value={bulk.temp ?? ""} onChange={(e) => setBulk({ ...bulk, temp: e.target.value === "" ? null : Number(e.target.value) })}
              className="w-20 rounded-lg border border-slate-300 px-2 py-1.5" aria-label="설정온도" />
            <span className="inline-flex gap-1">
              {DAY_LABELS.map((d, i) => (
                <button key={d} type="button" onClick={() => setBulk({ ...bulk, days: bulk.days.map((x, k) => (k === i ? !x : x)) })}
                  className={"h-7 w-7 rounded-full border text-xs font-semibold " + (bulk.days[i] ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-400")}>{d}</button>
              ))}
            </span>
            <input type="time" value={bulk.start} onChange={(e) => setBulk({ ...bulk, start: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="시작" />
            <span>~</span>
            <input type="time" value={bulk.end} onChange={(e) => setBulk({ ...bulk, end: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="종료" />
            <button type="button" onClick={applyBulk} className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-white">고른 {sel.size}대에 적용</button>
            <button type="button" onClick={() => setSel(new Set(units.map((u) => u.id)))} className="text-slate-600 underline">보이는 호기 모두 고르기</button>
            {sel.size > 0 && <button type="button" onClick={() => setSel(new Set())} className="text-slate-500 underline">고르기 해제</button>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {["전체", ...TENANTS].map((t) => (
          <button key={t} onClick={() => setTenant(t)}
            className={"rounded-full border px-3 py-1 text-sm font-semibold " + (tenant === t ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50")}>{t}</button>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {HVAC_MODES.map((m) => <span key={m} className="inline-flex items-center gap-1"><span className={"h-2.5 w-2.5 rounded-full " + BAR_STYLE[m]} />{m}</span>)}
          <span>· 막대 = 0~24시</span>
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              {editing && <th className="w-8 px-2 py-2" />}
              <th className="px-3 py-2">호기</th>
              <th className="px-3 py-2">구역</th>
              <th className="px-3 py-2">모드</th>
              <th className="px-3 py-2">설정온도</th>
              <th className="px-3 py-2">요일</th>
              <th className="px-3 py-2">가동 시간</th>
              <th className="w-1/4 px-3 py-2">0 · 6 · 12 · 18 · 24시</th>
            </tr>
          </thead>
          {floors.map((f) => (
            <tbody key={f} className="border-t border-slate-200">
              <tr><td colSpan={editing ? 8 : 7} className="bg-slate-50/60 px-3 py-1 text-xs font-bold text-slate-500">{f}</td></tr>
              {units.filter((u) => u.floor === f).map((u) => {
                const s = settings[u.id] ?? defaultSettings()[u.id];
                return (
                  <tr key={u.id} className={"border-t border-slate-100 " + (sel.has(u.id) ? "bg-amber-50" : "")}>
                    {editing && (
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={sel.has(u.id)} aria-label={`${u.id} 고르기`}
                          onChange={() => setSel((p) => { const n = new Set(p); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <button onClick={() => setOpen(u)} className="rounded-md border border-slate-300 px-2 py-0.5 font-mono text-sm font-bold text-slate-900 hover:border-slate-900 hover:bg-slate-900 hover:text-white" title="담당 구역 도면 보기">
                        {u.id}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <span className={"mr-1.5 text-xs font-semibold " + TENANT_STYLE[u.tenant]}>{u.tenant}</span>
                      <span className="text-slate-700">{u.zone}</span>
                    </td>
                    {editing ? (
                      <>
                        <td className="px-3 py-2">
                          <select value={s.mode} onChange={(e) => setOne(u.id, { mode: e.target.value as UnitSetting["mode"] })} className="rounded border border-slate-300 px-1 py-1" aria-label={`${u.id} 모드`}>
                            <option value="">—</option>
                            {HVAC_MODES.map((m) => <option key={m}>{m}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.5" value={s.temp ?? ""} onChange={(e) => setOne(u.id, { temp: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-16 rounded border border-slate-300 px-1 py-1" aria-label={`${u.id} 설정온도`} />
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex gap-0.5">
                            {DAY_LABELS.map((d, i) => (
                              <button key={d} type="button" onClick={() => setOne(u.id, { days: s.days.map((x, k) => (k === i ? !x : x)) })}
                                className={"h-6 w-6 rounded-full border text-[11px] font-semibold " + (s.days[i] ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-400")}>{d}</button>
                            ))}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <input type="time" value={s.start} onChange={(e) => setOne(u.id, { start: e.target.value })} className="rounded border border-slate-300 px-1 py-0.5" aria-label={`${u.id} 시작`} />
                          <span className="mx-1">~</span>
                          <input type="time" value={s.end} onChange={(e) => setOne(u.id, { end: e.target.value })} className="rounded border border-slate-300 px-1 py-0.5" aria-label={`${u.id} 종료`} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2"><span className={"rounded-full border px-2 py-0.5 text-xs font-semibold " + MODE_STYLE[s.mode]}>{s.mode || "미입력"}</span></td>
                        <td className="px-3 py-2 tabular-nums text-slate-800">{s.temp != null ? `${s.temp}℃` : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-2"><DaysText days={s.days} /></td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-800">{s.mode === "정지" ? <span className="text-slate-400">정지</span> : `${s.start} ~ ${s.end}`}</td>
                      </>
                    )}
                    <td className="px-3 py-2"><DayBar s={s} /></td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      {editing && (
        <div className="space-y-3 rounded-xl border-2 border-slate-900 bg-white p-4">
          <p className="text-sm font-bold text-slate-900">저장 — 바뀐 호기 {changed.length}대</p>
          {changed.length > 0 && (
            <ul className="max-h-40 space-y-0.5 overflow-auto text-xs text-slate-600">
              {changed.map((c) => <li key={c.id}><b className="font-mono text-slate-900">{c.id}</b> {c.from} → <b className="text-slate-900">{c.to}</b></li>)}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end">
            <label className="text-xs text-slate-600">적용일
              <input type="date" value={meta.effectiveFrom} onChange={(e) => setMeta({ ...meta, effectiveFrom: e.target.value })} className="mt-1 block rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-600">수정자
              <input value={meta.by} onChange={(e) => setMeta({ ...meta, by: e.target.value })} className="mt-1 block w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs text-slate-600">변경 사유
              <input value={meta.reason} onChange={(e) => setMeta({ ...meta, reason: e.target.value })} placeholder="예: 동절기 난방 전환, 입주사 요청으로 가동시간 연장"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <button onClick={save} disabled={saving || !changed.length} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:bg-slate-300">
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
          <p className="text-xs text-slate-500">저장하면 지우지 않고 새 판으로 쌓입니다. 적용일을 앞날로 잡으면 그날부터 화면에 반영됩니다.</p>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-bold text-slate-900">변경 이력</h2>
        {!history.length ? (
          <p className="text-sm text-slate-400">아직 기록이 없습니다. 기계과장이 첫 스케줄을 저장하면 여기에 쌓입니다.</p>
        ) : (
          <ul className="space-y-2">
            {history.map(({ v, diff }) => (
              <li key={v.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <button onClick={() => { setDate(v.effectiveFrom); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="font-bold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900" title="이 날짜 스케줄 보기">
                    {v.effectiveFrom} 부터
                  </button>
                  <span className="text-slate-700">{v.reason}</span>
                  <span className="ml-auto text-xs text-slate-400">{v.by} · {new Date(v.savedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 저장</span>
                </div>
                {diff.length > 0 && (
                  <details className="mt-1 text-xs text-slate-600">
                    <summary className="cursor-pointer text-slate-500">바뀐 호기 {diff.length}대</summary>
                    <ul className="mt-1 space-y-0.5">
                      {diff.map((c) => <li key={c.id}><b className="font-mono text-slate-900">{c.id}</b> {c.from ? `${c.from} → ` : ""}<b className="text-slate-900">{c.to}</b></li>)}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && <DrawingModal unit={open} s={settings[open.id] ?? defaultSettings()[open.id]} onClose={() => setOpen(null)} />}
    </div>
  );
}
