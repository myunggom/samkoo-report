"use client";

// 고객사 주간 업무 보고 — 예전 엑셀 양식과 같은 모양의 A4 세로 문서.
// 폭 794px 고정, 높이는 내용만큼 — elementToPdfBlobFlow 가 A4 쪽으로 잘라 준다.

import type { WeeklyLog } from "@/lib/weeklyLog";
import { WEEK_SLOTS, WEEK_TITLE, periodLabel } from "@/lib/weeklyLog";

const PAGE: React.CSSProperties = {
  width: 794,
  background: "#fff",
  color: "#111",
  padding: "32px 30px",
  boxSizing: "border-box",
  fontFamily: "var(--font-noto), sans-serif",
  fontSize: 10.5,
  lineHeight: 1.45,
};
const B = "1px solid #444";
const td: React.CSSProperties = { border: B, padding: "5px 7px", verticalAlign: "middle" };
const th: React.CSSProperties = { ...td, background: "#e7e6e6", fontWeight: 700, textAlign: "center" };
const txt: React.CSSProperties = { ...td, whiteSpace: "pre-wrap", verticalAlign: "top", height: 110 };

export default function WeeklyLogDocument({ log }: { log: WeeklyLog }) {
  return (
    <div style={PAGE} className="wl-page">
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 70 }} />
          <col />
          <col />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={3} style={{ ...th, background: "#d0cece", fontSize: 15, padding: 10 }}>{WEEK_TITLE}</td>
          </tr>
          <tr>
            <td style={th} rowSpan={2}>분야</td>
            <td style={th}>이번주 업무수행({periodLabel(log.thisFrom, log.thisTo)})</td>
            <td style={th}>다음주 업무 계획({periodLabel(log.nextFrom, log.nextTo)})</td>
          </tr>
          <tr>
            <td style={th}>업무내용</td>
            <td style={th}>업무내용</td>
          </tr>
          {WEEK_SLOTS.map((s) => (
            <tr key={s.key}>
              <td style={th}>{s.key}</td>
              <td style={txt}>{log.work[s.key]?.done ?? ""}</td>
              <td style={txt}>{log.work[s.key]?.plan ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}