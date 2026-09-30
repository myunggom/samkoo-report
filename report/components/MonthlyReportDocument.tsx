"use client";

// 고객사 월간 보고서 — 예전 엑셀(표지~5-2 근무표)과 같은 순서의 A4 페이지 묶음.
// 각 페이지는 .mr-page, 가로 페이지는 data-landscape="1" (lib/pdf.ts pagesToPdfBlob).

import type { MonthlyReport, Num } from "@/lib/monthlyReport";
import {
  AREA_M2, COVER_SLOTS, ENERGY, SITE, TRADES, addMonths, daysIn, diff, energyStats, monthDays, monthLabel, n, pct, rate,
  scheduleRow, weekday,
} from "@/lib/monthlyReport";
import { proxied } from "@/lib/client";

const P: React.CSSProperties = { width: 794, height: 1123, background: "#fff", color: "#111", padding: "34px 36px", boxSizing: "border-box",
  fontFamily: "var(--font-noto), sans-serif", fontSize: 10.5, lineHeight: 1.4, overflow: "hidden", position: "relative" };
const L: React.CSSProperties = { ...P, width: 1123, height: 794 };
const B = "1px solid #555";
const td: React.CSSProperties = { border: B, padding: "3px 5px", verticalAlign: "middle" };
const th: React.CSSProperties = { ...td, background: "#e7e6e6", fontWeight: 700, textAlign: "center" };
const c: React.CSSProperties = { ...td, textAlign: "center" };
const r: React.CSSProperties = { ...td, textAlign: "right" };
const txt: React.CSSProperties = { ...td, whiteSpace: "pre-wrap", verticalAlign: "top" };
const T: React.CSSProperties = { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" };
const H1 = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{children}</div>;
const H2 = ({ children }: { children: React.ReactNode }) => <div style={{ fontSize: 13, fontWeight: 700, margin: "10px 0 6px" }}>{children}</div>;
const Img = ({ url, h }: { url?: string; h: number }) =>
  url ? <img src={proxied(url)} alt="" style={{ width: "100%", height: h, objectFit: "contain", display: "block" }} />
      : <div style={{ height: h, display: "grid", placeItems: "center", color: "#bbb", border: "1px dashed #ccc" }}>사진 없음</div>;

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out.length ? out : [[]];
}
// 연속된 같은 값은 첫 칸만 보이게 (엑셀의 세로 병합 대신)
const shown = (xs: string[], i: number) => (i === 0 || xs[i] !== xs[i - 1] ? xs[i] : "");

export default function MonthlyReportDocument({ report: m }: { report: MonthlyReport }) {
  const dataMonth = addMonths(m.month, -1);          // 에너지·광열비는 전월분까지
  const nextMonth = addMonths(m.month, 1);           // 차월 계획·근무표
  const [dy, dm] = dataMonth.split("-").map(Number);
  const year = Number(m.month.slice(0, 4));
  const monthsHead = Array.from({ length: 12 }, (_, i) => `${i + 1}월`);

  const energyPage = (e: (typeof ENERGY)[number]) => {
    const d = m.energy[e.key];
    const block = (cur: Num[], prev: Num[], unit: string, note?: string, title?: string) => {
      const sc = energyStats(cur), sp = energyStats(prev);
      const row = (label: string, vals: Num[], stats: (Num | undefined)[], digits = 0, fmt = (v: Num) => n(v, digits)) => (
        <tr><td style={th}>{label}</td>{vals.map((v, i) => <td key={i} style={r}>{fmt(v)}</td>)}{stats.map((v, i) => <td key={i} style={r}>{fmt(v ?? null)}</td>)}</tr>
      );
      return (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, margin: "6px 0 3px" }}><span>{title}</span><span>[ 단위 : {unit} ]</span></div>
          <table style={{ ...T, fontSize: 9.5 }}>
            <tbody>
              <tr><td style={th}>구분</td>{monthsHead.map((h) => <td key={h} style={th}>{h}</td>)}{["계", "월 평균", "일 평균", "최고", "최저"].map((h) => <td key={h} style={th}>{h}</td>)}</tr>
              {row(`${year - 1}년`, prev, [sp.sum, sp.avg, sp.dayAvg, sp.max, sp.min])}
              {row(`${year}년`, cur, [sc.sum, sc.avg, sc.dayAvg, sc.max, sc.min])}
              {row("± 증감량", cur.map((v, i) => diff(v, prev[i])), [diff(sc.sum, sp.sum), diff(sc.avg, sp.avg), null, diff(sc.max, sp.max), diff(sc.min, sp.min)])}
              {row("증감률 %", cur.map((v, i) => rate(v, prev[i])), [rate(sc.sum, sp.sum), rate(sc.avg, sp.avg), null, null, null], 0, pct)}
              {row("일평균", cur.map((v, i) => (v && v > 0 ? v / monthDays(year, i + 1) : null)), [sc.sum / 365, sc.dayAvg, sc.avg === null ? null : sc.avg / 24, null, null], 1, (v) => n(v, 1))}
              {row("㎡ 당", cur.map((v) => (v && v > 0 ? v / AREA_M2 : null)), [sc.sum / AREA_M2, sc.avg === null ? null : sc.avg / AREA_M2, null, null, null], 2, (v) => n(v, 2))}
            </tbody>
          </table>
          <table style={{ ...T, marginTop: 6 }}><tbody>
            <tr><td style={th}>특이사항</td></tr>
            <tr><td style={{ ...txt, height: 70 }}>{note ?? ""}</td></tr>
          </tbody></table>
        </>
      );
    };
    return (
      <div key={e.key} className="mr-page" data-landscape="1" style={L}>
        <H1>2. 에너지 사용현황</H1>
        <div style={{ display: "flex", justifyContent: "space-between" }}><H2>{e.no}. {e.label} 사용 현황</H2><span style={{ fontSize: 10 }}>{e.note}</span></div>
        {block(d.usage, d.prevUsage, e.unit, d.usageNote, "<사용량>")}
        {block(d.cost, d.prevCost, "원", d.costNote, "<요금>")}
      </div>
    );
  };

  const hol = new Set(m.holidays);
  const days = daysIn(nextMonth);
  const staffRows = m.staff.map((s) => scheduleRow(s, nextMonth, m.holidays, m.overrides[s.name]));
  const facilityPages = chunk(m.facility, 44);
  const planPages = chunk(m.nextPlan, 46);

  return (
    <div>
      {/* 표지 */}
      <div className="mr-page" style={P}>
        <div style={{ border: "2px solid #333", padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{SITE}</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{monthLabel(m.month)} 월간 보고서</div>
        </div>
        <div style={{ margin: "12px 0" }}><Img url={m.coverImage} h={340} /></div>
        <table style={T}>
          <colgroup><col style={{ width: 70 }} /><col /><col /></colgroup>
          <tbody>
            <tr><td colSpan={3} style={{ ...th, fontSize: 12 }}>{SITE} 특이사항</td></tr>
            <tr><td style={th}>구분</td><td style={th}>당월 실시 사항</td><td style={th}>차월 실시 사항</td></tr>
            {COVER_SLOTS.map((k) => (
              <tr key={k}><td style={th}>{k}</td><td style={{ ...txt, fontSize: 9, height: 62 }}>{m.cover[k]?.now ?? ""}</td><td style={{ ...txt, fontSize: 9 }}>{m.cover[k]?.next ?? ""}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 목차 */}
      <div className="mr-page" style={P}>
        <div style={{ fontSize: 22, fontWeight: 700, textAlign: "center", margin: "30px 0" }}>{monthLabel(m.month)} 월간 보고서 목차</div>
        {[["1. 교육 실시 현황 및 조직도", ["1-1. 교육 실시 내역", "1-2. 교육 현장 사진", "1-3. 인원 현황 조직도"]],
          ["2. 에너지 사용현황", ["2-1. 광열비 분석", ...ENERGY.map((e) => `${e.no}. ${e.label} 사용 현황`)]],
          ["3. 층별 고객사 현황", ["3-1. 층별 고객사 현황", "3-2. 고객사 연락처"]],
          ["4. FM 수행 내역", ["4-1. 시설관리 실적", "4-2. 주요 작업 현황 사진"]],
          ["5. 차월 작업 계획", ["5-1. 차월 주요업무 계획", "5-2. 차월 근무표"]]].map(([h, items]) => (
          <div key={h as string} style={{ margin: "0 80px 20px", fontSize: 14 }}>
            <div style={{ fontWeight: 700 }}>{h}</div>
            {(items as string[]).map((x) => <div key={x} style={{ marginLeft: 24, marginTop: 4 }}>{x}</div>)}
          </div>
        ))}
      </div>

      {/* 1-1, 1-2 교육 */}
      <div className="mr-page" style={P}>
        <H1>1. 교육 실시 현황 및 조직도</H1>
        <H2>1-1. 교육 실시 내역</H2>
        <table style={T}><tbody>
          <tr>{["교육명", "교육기관(인)", "피교육생", "일자", "위치", "비고"].map((h) => <td key={h} style={th}>{h}</td>)}</tr>
          {m.education.rows.map((x, i) => (
            <tr key={i}><td style={txt}>{x.name}</td><td style={c}>{x.org}</td><td style={{ ...c, whiteSpace: "pre-wrap" }}>{x.trainees}</td><td style={c}>{x.date}</td><td style={c}>{x.place}</td><td style={c}>{x.note}</td></tr>
          ))}
        </tbody></table>
        <H2>1-2. 교육 현장 사진</H2>
        <table style={T}><tbody>
          <tr>
            <td style={{ ...td, padding: 4 }}><Img url={m.education.photos[0]?.url} h={420} /></td>
            <td style={{ ...td, padding: 4 }}><Img url={m.education.photos[1]?.url} h={420} /></td>
            <td style={{ ...td, padding: 4 }}><Img url={m.education.photos[2]?.url} h={208} /><div style={{ height: 4 }} /><Img url={m.education.photos[3]?.url} h={208} /></td>
          </tr>
          <tr><td style={c}>교육자료</td><td style={c}>회의록</td><td style={c}>교육 사진 및 안전상황판 업데이트</td></tr>
        </tbody></table>
      </div>

      {/* 1-3 조직도 */}
      <div className="mr-page" style={P}>
        <H2>1-3. 인원 현황 조직도</H2>
        <div style={{ textAlign: "right", margin: "4px 0 8px" }}>기준일 : {m.month}-01</div>
        <Img url={m.orgImage} h={920} />
      </div>

      {/* 2-1 광열비 분석 */}
      <div className="mr-page" style={P}>
        <H1>2. 에너지 사용현황</H1>
        <H2>2-1. 광열비 분석</H2>
        <div style={{ margin: "6px 0 3px", fontWeight: 700 }}>&lt;증감량 비교표&gt;</div>
        <table style={T}><tbody>
          <tr><td style={th} rowSpan={2}>구분</td><td style={th} colSpan={4}>전년대비 증감량 분석 [원]</td></tr>
          <tr><td style={th}>{dy}년 {dm}월</td><td style={th}>{dy - 1}년 {dm}월</td><td style={th}>증감량 [원]</td><td style={th}>증감률 [%]</td></tr>
          {ENERGY.map((e) => {
            const cur = m.energy[e.key].cost[dm - 1] ?? null;
            const prev = dy === year ? m.energy[e.key].prevCost[dm - 1] ?? null : m.energy[e.key].cost[dm - 1] ?? null;
            return <tr key={e.key}><td style={th}>{e.label}</td><td style={r}>{n(cur)}</td><td style={r}>{n(prev)}</td><td style={r}>{n(diff(cur, prev))}</td><td style={r}>{pct(rate(cur, prev))}</td></tr>;
          })}
        </tbody></table>
        <div style={{ margin: "14px 0 3px", fontWeight: 700 }}>&lt;증감분석 내용&gt;</div>
        <table style={T}><colgroup><col style={{ width: 90 }} /><col /></colgroup><tbody>
          <tr><td style={th}>구분</td><td style={th}>전년대비 증감량 분석</td></tr>
          {ENERGY.map((e) => <tr key={e.key}><td style={th}>{e.label}</td><td style={{ ...txt, height: 40 }}>{m.costNotes[e.key] || "전년대비 증감 분석 불가"}</td></tr>)}
        </tbody></table>
      </div>

      {ENERGY.map(energyPage)}

      {/* 3-1, 3-2 */}
      <div className="mr-page" style={P}>
        <H1>3. 층별 고객사 현황</H1>
        <H2>3-1. 층별 고객사 현황</H2>
        <Img url={m.tenantsImage} h={900} />
      </div>
      <div className="mr-page" style={P}>
        <H2>3-2. 고객사 연락처</H2>
        <table style={T}><tbody>
          <tr>{["입주사", "층", "담당자", "연락처", "개인연락처(H.P)", "상주인원(명)", "비고"].map((h) => <td key={h} style={th}>{h}</td>)}</tr>
          {m.contacts.map((x, i, a) => (
            <tr key={i}>{[shown(a.map((y) => y.tenant), i), x.floor, shown(a.map((y) => y.tenant + y.person), i) ? x.person : "", x.tel, shown(a.map((y) => y.tenant + y.mobile), i) ? x.mobile : "", x.count, x.note].map((v, j) => <td key={j} style={c}>{v}</td>)}</tr>
          ))}
        </tbody></table>
      </div>

      {/* 4-1 시설관리 실적 */}
      {facilityPages.map((rows, pi) => {
        const all = m.facility;
        const off = pi * 44;
        return (
          <div key={`f${pi}`} className="mr-page" style={P}>
            {pi === 0 && <H1>4. FM 수행내역</H1>}
            <H2>4-1. 시설관리 및 미화, 보안 일정{pi > 0 ? " (계속)" : ""}</H2>
            <table style={{ ...T, fontSize: 9 }}>
              <colgroup><col style={{ width: 50 }} /><col style={{ width: 80 }} /><col /><col style={{ width: 38 }} /><col style={{ width: 38 }} /><col style={{ width: 38 }} /><col style={{ width: 50 }} /></colgroup>
              <tbody>
                <tr><td style={th}>구분</td><td style={th}>세부</td><td style={th}>내용</td><td style={th}>완료</td><td style={th}>진행중</td><td style={th}>계획중</td><td style={th}>비고</td></tr>
                {rows.map((x, i) => {
                  const k = off + i;
                  return (
                    <tr key={k}>
                      <td style={{ ...c, fontWeight: 700 }}>{k === off || all[k - 1].group !== x.group ? x.group : ""}</td>
                      <td style={c}>{k === off || all[k - 1].sub !== x.sub || all[k - 1].group !== x.group ? x.sub : ""}</td>
                      <td style={td}>{x.content}</td>
                      {(["완료", "진행중", "계획중"] as const).map((s) => <td key={s} style={c}>{x.status === s ? "○" : ""}</td>)}
                      <td style={c}>{x.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* 4-2 주요작업현황사진: 공종마다 한 쪽, 세트(사진 2장+작업명) 12개 */}
      {TRADES.map((t) => {
        const sets = m.photos[t] ?? [];
        return (
          <div key={t} className="mr-page" style={P}>
            <H2>4-2. 주요 작업 현황 사진</H2>
            <div style={{ ...th, border: B, padding: 6, fontSize: 12 }}>{SITE} 시설 업무현황 - {t}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
              {Array.from({ length: 12 }, (_, i) => sets[i] ?? { name: "" }).map((s, i) => (
                <div key={i} style={{ border: B, padding: 3 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                    <Img url={s.a} h={118} />
                    <Img url={s.b} h={118} />
                  </div>
                  <div style={{ textAlign: "center", fontSize: 9.5, marginTop: 2, minHeight: 14, whiteSpace: "pre-wrap" }}>{s.name}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* 5-1 차월 주요업무계획 */}
      {planPages.map((rows, pi) => (
        <div key={`p${pi}`} className="mr-page" style={P}>
          {pi === 0 && <H1>5. 차월 작업 계획</H1>}
          <H2>5-1. {monthLabel(nextMonth)} 주요업무 계획{pi > 0 ? " (계속)" : ""}</H2>
          <table style={{ ...T, fontSize: 9.5 }}>
            <colgroup><col style={{ width: 60 }} /><col /><col style={{ width: 90 }} /><col style={{ width: 90 }} /></colgroup>
            <tbody>
              <tr><td style={th}>작업 구분</td><td style={th}>작업 내용</td><td style={th}>작업 예정일</td><td style={th}>비고</td></tr>
              {rows.map((x, i) => {
                const k = pi * 46 + i;
                return <tr key={k}><td style={{ ...c, fontWeight: 700 }}>{k === pi * 46 || m.nextPlan[k - 1].group !== x.group ? x.group : ""}</td><td style={td}>{x.content}</td><td style={c}>{x.when}</td><td style={c}>{x.note}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* 5-2 차월 근무표 (가로) */}
      <div className="mr-page" data-landscape="1" style={{ ...L, padding: "26px 22px" }}>
        <H2>5-2. 차월 근무표</H2>
        <div style={{ textAlign: "center", fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{SITE} {monthLabel(nextMonth)} 근무표</div>
        <table style={{ ...T, fontSize: 8.5 }}>
          <colgroup><col style={{ width: 62 }} /><col style={{ width: 34 }} /><col style={{ width: 70 }} /><col style={{ width: 22 }} /><col style={{ width: 44 }} /><col style={{ width: 78 }} />{days.map((d) => <col key={d} />)}</colgroup>
          <tbody>
            <tr>
              <td style={th} rowSpan={2}>구분</td><td style={th} rowSpan={2}>부서</td><td style={th} rowSpan={2}>직급</td><td style={th} rowSpan={2}>TO</td><td style={th} rowSpan={2}>성명</td><td style={th} rowSpan={2}>연락처</td>
              {days.map((d) => <td key={d} style={{ ...th, padding: 1 }}>{Number(d.slice(8))}</td>)}
            </tr>
            <tr>{days.map((d) => { const w = weekday(d); return <td key={d} style={{ ...th, padding: 1, color: w === 0 || hol.has(d) ? "#c00" : w === 6 ? "#036" : "#111" }}>{"일월화수목금토"[w]}</td>; })}</tr>
            {m.staff.map((s, i) => (
              <tr key={i}>
                <td style={{ ...c, fontSize: 8 }}>{shown(m.staff.map((x) => x.group), i)}</td>
                <td style={c}>{shown(m.staff.map((x) => x.group + x.dept), i) ? s.dept : ""}</td>
                <td style={c}>{s.title}</td><td style={c}>{s.to}</td><td style={c}>{s.name}</td><td style={{ ...c, fontSize: 8 }}>{s.phone}</td>
                {staffRows[i].map((v, j) => <td key={j} style={{ ...c, padding: 1, background: v === "휴" ? "#f2f2f2" : v === "야" ? "#fff2cc" : undefined }}>{v}</td>)}
              </tr>
            ))}
            <tr><td style={th} colSpan={3}>총계</td><td style={c}>{m.staff.reduce((a, s) => a + (s.to || 0), 0)}</td><td style={c} colSpan={2} />
              {days.map((d, j) => <td key={d} style={{ ...c, padding: 1 }}>{staffRows.filter((row) => row[j]).length}</td>)}</tr>
          </tbody>
        </table>
        <div style={{ marginTop: 6, fontSize: 9.5, whiteSpace: "pre-wrap" }}>{m.scheduleNote ?? " - 상기 일정은 현장 업무진행 상황에 따라 변경될 수 있음 (주: 주간, 야: 야간, 비: 비번, 휴: 휴무)"}</div>
      </div>
    </div>
  );
}