"use client";

// 고객사 일일 업무일지 — 예전 엑셀 양식과 같은 모양의 A4 세로 문서.
// 폭 794px(96dpi A4) 고정, 높이는 내용만큼 — elementToPdfBlobFlow 가 A4 쪽으로 잘라 준다.
// MonthlyLogDocument 는 월말에 보내는 월간 누적 자료.

import type { DailyLog, MeterRow } from "@/lib/dailyLog";
import { METERS, TEAMS, WORK_SLOTS, dateLabel, fmt, meterRows, sumPeople, usageOn } from "@/lib/dailyLog";

export const TITLE = "프로젠 · 제넥신 · 셀리드 삼구INC 일일 업무일지";

const PAGE: React.CSSProperties = {
  width: 794,
  background: "#fff",
  color: "#111",
  padding: "28px 30px",
  boxSizing: "border-box",
  fontFamily: "var(--font-noto), sans-serif",
  fontSize: 10,
  lineHeight: 1.35,
};
const B = "1px solid #444";
const td: React.CSSProperties = { border: B, padding: "3px 5px", verticalAlign: "middle" };
const th: React.CSSProperties = { ...td, background: "#e7e6e6", fontWeight: 700, textAlign: "center" };
const c: React.CSSProperties = { ...td, textAlign: "center" };
const txt: React.CSSProperties = { ...td, whiteSpace: "pre-wrap", verticalAlign: "top", fontSize: 9.5 };
const num: React.CSSProperties = { ...td, textAlign: "right" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" };
const band: React.CSSProperties = { ...th, background: "#d0cece", fontSize: 11 };

// 전력은 배율 때문에 값이 커서 정수로, 나머지는 소수 둘째 자리 (예전 엑셀 표시 그대로)
function usageText(r: MeterRow, v: number | null): string {
  return fmt(v, r.def.factor ? 0 : 2);
}

export default function DailyLogDocument({ logs, log }: { logs: DailyLog[]; log: DailyLog }) {
  const p = log.people;
  const to = sumPeople(p?.to);
  const actual = sumPeople(p?.actual);
  const rows = meterRows(logs, log.date);
  const w = (k: string) => log.work[k] ?? {};
  const main = WORK_SLOTS.filter((s) => !s.key.startsWith("미화"));
  const [pub, priv] = [w("미화공용"), w("미화전용")];

  return (
    <div style={PAGE} className="dl-page">
      <table style={table}>
        <tbody>
          <tr><td style={{ ...band, fontSize: 14, padding: 7 }}>{TITLE}</td></tr>
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, margin: "4px 0 2px" }}>
        <span>■ 인원현황</span>
        <span>{dateLabel(log.date)}</span>
      </div>

      {/* 인원현황 */}
      <table style={table}>
        <colgroup>
          <col style={{ width: 80 }} />
          {TEAMS.map((t) => <col key={t} />)}
          <col /><col style={{ width: 70 }} /><col /><col /><col /><col style={{ width: 120 }} />
        </colgroup>
        <tbody>
          <tr>
            <td style={th}>구분</td>
            {TEAMS.map((t) => <td key={t} style={th}>{t}</td>)}
            <td style={th}>총원</td>
            <td style={th} rowSpan={4}>인원<br />세부 현황</td>
            <td style={th}>비번</td><td style={th}>결원</td><td style={th}>휴가</td><td style={th}>비 고</td>
          </tr>
          <tr>
            <td style={th}>T O</td>
            {TEAMS.map((t, i) => <td key={t} style={c}>{p?.to[i] ?? ""}</td>)}
            <td style={c}>{p ? to : ""}</td>
            <td style={c} rowSpan={3}>{p?.off ?? ""}</td>
            <td style={c} rowSpan={3}>{p ? to - actual : ""}</td>
            <td style={c} rowSpan={3}>{p?.leave ?? ""}</td>
            <td style={{ ...txt, verticalAlign: "middle" }} rowSpan={3}>{p?.note ?? ""}</td>
          </tr>
          <tr>
            <td style={th}>실근무인원</td>
            {TEAMS.map((t, i) => <td key={t} style={c}>{p?.actual[i] ?? ""}</td>)}
            <td style={c}>{p ? actual : ""}</td>
          </tr>
          <tr>
            <td style={th}>근무현황</td>
            <td style={{ ...c, fontWeight: 700 }} colSpan={5}>{p ? actual : ""}</td>
          </tr>
        </tbody>
      </table>

      {/* 업무 */}
      <table style={{ ...table, marginTop: 10 }}>
        <colgroup>
          <col style={{ width: 80 }} /><col style={{ width: 62 }} /><col /><col /><col style={{ width: 90 }} />
        </colgroup>
        <tbody>
          <tr>
            <td style={th}>구 분</td>
            <td style={th} colSpan={2}>금일 업무 내용</td>
            <td style={th}>명일 업무 계획</td>
            <td style={th}>비 고</td>
          </tr>
          {main.map((s) => {
            const e = w(s.key);
            const two = s.extra && !!e.extra;
            return [
              <tr key={s.key}>
                <td style={th} rowSpan={two ? 2 : 1}>{s.label}</td>
                <td style={{ ...txt, height: 34 }} colSpan={2}>{e.today ?? ""}</td>
                <td style={txt}>{e.plan ?? ""}</td>
                <td style={{ ...c, whiteSpace: "pre-wrap", fontSize: 9 }} rowSpan={two ? 2 : 1}>{e.note ?? ""}</td>
              </tr>,
              two ? (
                <tr key={s.key + "-x"}>
                  <td style={txt} colSpan={3}>{e.extra}</td>
                </tr>
              ) : null,
            ];
          })}
          <tr>
            <td style={th} rowSpan={pub.extra ? 3 : 2}>미화</td>
            <td style={c}>공용부</td>
            <td style={{ ...txt, height: 34 }}>{pub.today ?? ""}</td>
            <td style={txt}>{pub.plan ?? ""}</td>
            <td style={td} rowSpan={pub.extra ? 3 : 2} />
          </tr>
          <tr>
            <td style={c}>전용부</td>
            <td style={{ ...txt, height: 24 }}>{priv.today ?? ""}</td>
            <td style={txt}>{priv.plan ?? ""}</td>
          </tr>
          {pub.extra ? (
            <tr><td style={txt} colSpan={3}>{pub.extra}</td></tr>
          ) : null}
        </tbody>
      </table>

      {/* 특이사항 */}
      <table style={{ ...table, marginTop: 10 }}>
        <tbody>
          <tr><td style={th}>특 이 사 항</td></tr>
          <tr><td style={{ ...txt, height: 44 }}>{log.special ?? ""}</td></tr>
        </tbody>
      </table>

      {/* 에너지 사용량 */}
      <table style={{ ...table, marginTop: 10 }}>
        <colgroup>
          <col style={{ width: 58 }} /><col style={{ width: 96 }} /><col style={{ width: 52 }} />
          <col /><col /><col /><col /><col style={{ width: 70 }} />
        </colgroup>
        <tbody>
          <tr><td style={th} colSpan={8}>에너지 사용량</td></tr>
          <tr>
            <td style={th} colSpan={2}>구분</td><td style={th}>단위</td><td style={th}>전일검침</td>
            <td style={th}>금일검침 / 발전량</td><td style={th}>사용량</td><td style={th}>월 누계</td><td style={th}>비고(배율)</td>
          </tr>
          {rows.map((r, i) => (
            <tr key={r.def.key}>
              {i === 0 || rows[i - 1].def.group !== r.def.group ? (
                <td style={th} rowSpan={rows.filter((x) => x.def.group === r.def.group).length}>{r.def.group}</td>
              ) : null}
              <td style={c}>{r.def.label}</td>
              <td style={c}>[ {r.def.unit} ]</td>
              <td style={num}>{fmt(r.prev)}</td>
              <td style={num}>{fmt(r.today)}</td>
              <td style={num}>{r.def.daily ? "" : usageText(r, r.usage)}</td>
              <td style={num}>{usageText(r, r.month)}</td>
              <td style={num}>{r.def.factor ? r.def.factor.toLocaleString("ko-KR") : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 월간 누적 자료: 날짜별 사용량 표 + 월 합계 + 업무 기록
export function MonthlyLogDocument({ logs, month }: { logs: DailyLog[]; month: string }) {
  const days = logs.filter((l) => l.date.startsWith(month) && (Object.keys(l.meters).length || Object.keys(l.work).length));
  const cols = METERS;
  const val = (date: string, i: number) => usageOn(logs, date, cols[i]);
  const total = (i: number) => days.reduce((s, d) => s + (val(d.date, i) ?? 0), 0);
  const digits = (i: number) => (cols[i].factor ? 0 : 2);

  return (
    <div style={PAGE} className="dl-page">
      <table style={table}>
        <tbody>
          <tr><td style={{ ...band, fontSize: 14, padding: 7 }}>{TITLE.replace("일일", "월간")} — {month.replace("-", "년 ")}월</td></tr>
        </tbody>
      </table>

      <div style={{ fontWeight: 700, margin: "10px 0 3px" }}>■ 에너지 사용량 (일별)</div>
      <table style={table}>
        <tbody>
          <tr>
            <td style={th}>날짜</td>
            {cols.map((m) => <td key={m.key} style={th}>{m.label}<br />[{m.unit}]</td>)}
          </tr>
          {days.map((d) => (
            <tr key={d.date}>
              <td style={c}>{dateLabel(d.date).slice(5)}</td>
              {cols.map((m, i) => <td key={m.key} style={num}>{fmt(val(d.date, i), digits(i))}</td>)}
            </tr>
          ))}
          <tr>
            <td style={th}>월 합계</td>
            {cols.map((m, i) => <td key={m.key} style={{ ...num, fontWeight: 700 }}>{fmt(total(i), digits(i))}</td>)}
          </tr>
        </tbody>
      </table>

      <div style={{ fontWeight: 700, margin: "14px 0 3px" }}>■ 업무 기록</div>
      <table style={table}>
        <colgroup><col style={{ width: 70 }} /><col style={{ width: 62 }} /><col /></colgroup>
        <tbody>
          <tr><td style={th}>날짜</td><td style={th}>구분</td><td style={th}>금일 업무 내용</td></tr>
          {days.flatMap((d) => [
            ...WORK_SLOTS.filter((s) => d.work[s.key]?.today).map((s) => (
              <tr key={d.date + s.key}>
                <td style={c}>{dateLabel(d.date).slice(5)}</td>
                <td style={c}>{s.key.startsWith("미화") ? "미화 " + s.label : s.label}</td>
                <td style={txt}>{[d.work[s.key].today, d.work[s.key].extra].filter(Boolean).join("\n")}</td>
              </tr>
            )),
            d.special ? (
              <tr key={d.date + "-sp"}>
                <td style={c}>{dateLabel(d.date).slice(5)}</td><td style={c}>특이사항</td><td style={txt}>{d.special}</td>
              </tr>
            ) : null,
          ])}
        </tbody>
      </table>
    </div>
  );
}
