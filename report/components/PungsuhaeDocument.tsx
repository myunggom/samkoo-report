"use client";

// 풍수해 예방 점검 보고서 — PDF용 세로 A4 2페이지 문서.
// 화면 밖(off-screen)에 렌더링해 html2canvas로 캡처합니다. 각 페이지는 `.pung-page`.
// A4 세로 794×1123px(96dpi) 고정 크기.
//
// 칸 넓이는 원본 docx 양식과 동일 비율(dxa 기준):
//  · 상단 정보표 6열: 1101 / 2155 / 1275 / 1531 / 1134 / 2037  (합 9233)
//  · 점검표 3열: 구분 1668 / 점검내용 5528 / 점검결과 2037      (합 9233)
// 점검표 페이지는 세로로 A4 한 장을 꽉 채우도록 표가 늘어납니다.

import type { PungReport, PungCheckItem } from "@/lib/pungsuhae";
import { dotDate, effectiveCaption, RESULT_LEGEND } from "@/lib/pungsuhae";
import { proxied } from "@/lib/client";

// 같은 구분(category)이 연속되면 세로 병합(rowSpan)으로 묶기
function groupByCategory(items: PungCheckItem[]): { category: string; rows: PungCheckItem[] }[] {
  const out: { category: string; rows: PungCheckItem[] }[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.category === it.category) last.rows.push(it);
    else out.push({ category: it.category, rows: [it] });
  }
  return out;
}

const PAGE: React.CSSProperties = {
  width: 794,
  height: 1123,
  background: "#fff",
  color: "#111",
  padding: "40px 48px",
  boxSizing: "border-box",
  fontFamily: "var(--font-noto), sans-serif",
  display: "flex",
  flexDirection: "column",
};

export default function PungsuhaeDocument({ report }: { report: PungReport }) {
  const groups = groupByCategory(report.checklist);

  return (
    <div>
      {/* ── 1페이지: 점검표 (A4 한 장 꽉차게) ───────────── */}
      <div className="pung-page" style={PAGE}>
        <h1 style={{ textAlign: "center", fontSize: 24, fontWeight: 700, margin: "6px 0 22px", flex: "0 0 auto" }}>
          풍수해 예방 점검표
        </h1>

        {/* 상단 정보표 — 원본 6열 비율 */}
        <table style={{ ...tbl, flex: "0 0 auto" }}>
          <colgroup>
            <col style={{ width: "11.93%" }} />
            <col style={{ width: "23.34%" }} />
            <col style={{ width: "13.81%" }} />
            <col style={{ width: "16.58%" }} />
            <col style={{ width: "12.28%" }} />
            <col style={{ width: "22.06%" }} />
          </colgroup>
          <tbody>
            <tr style={{ height: 56 }}>
              <th style={{ ...cell, ...head }}>사업장명</th>
              <td style={cell}>{report.site}</td>
              <th style={{ ...cell, ...head }}>점검일자</th>
              <td style={{ ...cell, textAlign: "center" }}>{dotDate(report.date)}</td>
              <th style={{ ...cell, ...head }}>점검자</th>
              <td style={{ ...cell, textAlign: "center" }}>{report.inspector || ""}</td>
            </tr>
          </tbody>
        </table>

        {/* 점검 체크리스트 — 세로로 남은 공간을 꽉 채움 */}
        <div style={{ flex: "1 1 auto", display: "flex", marginTop: 14 }}>
          <table style={{ ...tbl, height: "100%" }}>
            <colgroup>
              <col style={{ width: "18.06%" }} />
              <col style={{ width: "59.87%" }} />
              <col style={{ width: "22.06%" }} />
            </colgroup>
            <thead>
              <tr style={{ height: 44 }}>
                <th style={{ ...cell, ...head }}>구분</th>
                <th style={{ ...cell, ...head }}>점검내용</th>
                <th style={{ ...cell, ...head }}>점검결과</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) =>
                g.rows.map((r, ri) => (
                  <tr key={`${gi}-${ri}`}>
                    {ri === 0 && (
                      <td style={{ ...cell, textAlign: "center", fontWeight: 600 }} rowSpan={g.rows.length}>
                        {g.category}
                      </td>
                    )}
                    <td style={{ ...cell, textAlign: "left" }}>{r.content}</td>
                    <td style={{ ...cell, textAlign: "center" }}>{r.result}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p style={{ margin: "10px 0 0", fontSize: 13, color: "#333", flex: "0 0 auto" }}>{RESULT_LEGEND}</p>
      </div>

      {/* ── 2페이지: 사진 ─────────────────────────────── */}
      <div className="pung-page" style={PAGE}>
        <div style={{ flex: "1 1 auto", display: "flex" }}>
          <table style={{ ...tbl, height: "100%" }}>
            <colgroup>
              <col style={{ width: "33.33%" }} />
              <col style={{ width: "33.33%" }} />
              <col style={{ width: "33.34%" }} />
            </colgroup>
            <tbody>
              {report.sections.map((sec) => (
                <PhotoBlock key={sec.id} title={sec.title} slots={[sec.slots[0], sec.slots[1], sec.slots[2]]} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PhotoBlock({
  title,
  slots,
}: {
  title: string;
  slots: (import("@/lib/pungsuhae").PungSlot | undefined)[];
}) {
  return (
    <>
      {/* 구간 제목 */}
      <tr style={{ height: 26 }}>
        <td
          colSpan={3}
          style={{ ...cell, background: "#D9D9D9", textAlign: "left", fontWeight: 700, fontSize: 13, padding: "5px 8px" }}
        >
          {title}
        </td>
      </tr>
      {/* 사진 3칸 — 남은 높이를 나눠 가짐 */}
      <tr>
        {slots.map((s, i) => (
          <td key={i} style={{ ...cell, verticalAlign: "middle", padding: 3, height: 150 }}>
            {s?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxied(s.url)}
                alt=""
                crossOrigin="anonymous"
                style={{ width: "100%", height: "100%", minHeight: 138, objectFit: "cover", display: "block" }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", minHeight: 138, background: "#f3f4f6" }} />
            )}
          </td>
        ))}
      </tr>
      {/* 캡션 3칸 */}
      <tr style={{ height: 24 }}>
        {slots.map((s, i) => (
          <td key={i} style={{ ...cell, fontSize: 12, padding: "4px 6px", textAlign: "center" }}>
            {s ? effectiveCaption(s) : ""}
          </td>
        ))}
      </tr>
    </>
  );
}

// 표 스타일 — 얇은 검정 테두리
const tbl: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};
const cell: React.CSSProperties = {
  border: "1px solid #333",
  padding: "6px 8px",
  fontSize: 13,
  verticalAlign: "middle",
  wordBreak: "break-word",
};
const head: React.CSSProperties = {
  background: "#F2F2F2",
  fontWeight: 700,
  textAlign: "center",
};
