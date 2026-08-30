"use client";

// 일반 보고서 PDF 문서 — A4 너비(794px) 컨테이너 하나. 길이는 가변이며
// lib/pdf.ts elementToPdfBlobFlow가 세로로 잘라 여러 A4 페이지로 만듭니다.

import type { GenReport, ReportPhoto } from "@/lib/reports";
import { dotDate, layoutOf } from "@/lib/reports";
import { proxied } from "@/lib/client";

const DOC: React.CSSProperties = {
  width: 794,
  background: "#fff",
  color: "#111",
  padding: "44px 52px",
  boxSizing: "border-box",
  fontFamily: "var(--font-noto), sans-serif",
  fontSize: 14,
  lineHeight: 1.6,
};

export default function GenReportDocument({ report }: { report: GenReport }) {
  return <div style={DOC}>{layoutOf(report.kind) === "accident" ? <Accident r={report} /> : <Common r={report} />}</div>;
}

// ── 공통 양식 (완료·점검·보수요청) ─────────────────────────
function Common({ r }: { r: GenReport }) {
  return (
    <div>
      <h1 style={{ textAlign: "center", fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>
        {r.docTitle || r.subject || "보고서"}
      </h1>
      <div style={{ textAlign: "right", fontSize: 13, color: "#333", marginBottom: 18 }}>
        {dotDate(r.date)} &nbsp;·&nbsp; 삼구INC
      </div>

      {r.sections.map((s, i) => (
        <section key={s.id} style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>
            {i + 1}. {s.heading}
          </h2>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{s.body || " "}</div>
        </section>
      ))}

      <section>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>{r.sections.length + 1}. 첨부사진</h2>
        <PhotoGrid photos={r.photos} />
      </section>
    </div>
  );
}

// ── 사고보고서 (키-값 표) ──────────────────────────────────
function Accident({ r }: { r: GenReport }) {
  const a = r.accident;
  return (
    <div>
      <div style={{ background: "#000", color: "#fff", textAlign: "center", fontWeight: 700, fontSize: 20, padding: "16px 0", letterSpacing: 6 }}>
        {r.docTitle || "사 고 보 고 서"}
      </div>

      <table style={{ ...tbl, marginTop: 0 }}>
        <colgroup>
          <col style={{ width: "16%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "33%" }} />
          <col style={{ width: "33%" }} />
        </colgroup>
        <tbody>
          <tr>
            <th style={cellH}>보고자</th>
            <td style={cell}>{a.reporter}</td>
            <th style={cellH}>보고일</th>
            <td style={cell}>{dotDate(r.date)}</td>
          </tr>

          <tr>
            <th style={cellH} rowSpan={5}>사고 개요</th>
            <th style={cellH}>제목</th>
            <td style={cell} colSpan={2}>{a.title}</td>
          </tr>
          <tr><th style={cellH}>발생 일시</th><td style={cell} colSpan={2}>{a.occurredAt}</td></tr>
          <tr><th style={cellH}>발생 장소</th><td style={cell} colSpan={2}>{a.place}</td></tr>
          <tr><th style={cellH}>발생 원인</th><td style={cell} colSpan={2}>{a.cause}</td></tr>
          <tr><th style={cellH}>피해 범위</th><td style={cell} colSpan={2}>{a.scope}</td></tr>

          <tr>
            <th style={cellH} rowSpan={3}>피해 현황</th>
            <th style={cellH}>인적 피해</th>
            <td style={cell} colSpan={2}>{a.humanDamage}</td>
          </tr>
          <tr><th style={cellH}>물적 피해</th><td style={cell} colSpan={2}>{a.propertyDamage}</td></tr>
          <tr><th style={cellH}>피해액</th><td style={cell} colSpan={2}>{a.damageCost}</td></tr>

          <tr>
            <th style={cellH}>조치 사항 및 경과</th>
            <td style={{ ...cell, whiteSpace: "pre-wrap", textAlign: "left", verticalAlign: "top", padding: 8 }} colSpan={3}>{a.actions}</td>
          </tr>
          <tr>
            <th style={cellH}>대응 적합성 및 향후 방안</th>
            <td style={{ ...cell, whiteSpace: "pre-wrap", textAlign: "left", verticalAlign: "top", padding: 8 }} colSpan={3}>{a.followup}</td>
          </tr>
        </tbody>
      </table>

      <h2 style={{ fontSize: 15, fontWeight: 700, margin: "18px 0 8px" }}>[첨부] 사진</h2>
      <PhotoGrid photos={r.photos} />
    </div>
  );
}

// ── 사진 2열 그리드 + 설명 ─────────────────────────────────
function PhotoGrid({ photos }: { photos: ReportPhoto[] }) {
  const filled = photos.filter((p) => p.url);
  if (filled.length === 0) return <p style={{ fontSize: 13, color: "#999" }}>첨부된 사진이 없습니다.</p>;
  return (
    <table style={tbl}>
      <colgroup>
        <col style={{ width: "50%" }} />
        <col style={{ width: "50%" }} />
      </colgroup>
      <tbody>
        {Array.from({ length: Math.ceil(filled.length / 2) }).map((_, row) => {
          const pair = [filled[row * 2], filled[row * 2 + 1]];
          return (
            <tr key={row}>
              {pair.map((p, ci) => (
                <td key={ci} style={{ ...cell, padding: 0, verticalAlign: "top" }}>
                  {p ? (
                    <div>
                      <div style={{ height: 210, background: "#f3f4f6" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={proxied(p.url!)} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                      </div>
                      <div style={{ borderTop: "1px solid #333", padding: "5px 8px", fontSize: 12, textAlign: "center", minHeight: 22 }}>
                        {p.caption || " "}
                      </div>
                    </div>
                  ) : (
                    <div style={{ height: 232 }} />
                  )}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginTop: 4 };
const cell: React.CSSProperties = { border: "1px solid #333", padding: "6px 8px", fontSize: 13, verticalAlign: "middle", textAlign: "center", wordBreak: "break-word" };
const cellH: React.CSSProperties = { ...cell, background: "#F2F2F2", fontWeight: 700 };
