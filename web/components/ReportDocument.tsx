"use client";

import { forwardRef } from "react";
import type { Photo, Report, ReportSection, Schedule } from "@/lib/types";
import { SECTION_LABELS, SECTION_ORDER } from "@/lib/types";
import { prettyDateTime, setupRange, shootPeriod, shootRange } from "@/lib/format";
import { proxied } from "@/lib/client";

type Props = { schedule: Schedule; report: Report; rounds?: Schedule[] };

// A4 가로 @96dpi
const PAGE_W = 1123;
const PAGE_H = 794;
const PER_PAGE = 8; // 섹션 페이지당 사진 (가로4 × 세로2)
const NAVY = "#0f2c5c";

const pageBase: React.CSSProperties = {
  width: PAGE_W,
  height: PAGE_H,
  background: "#fff",
  color: "#111",
  boxSizing: "border-box",
  padding: 28,
  display: "flex",
  flexDirection: "column",
};

const th: React.CSSProperties = {
  background: "#eef2f7",
  border: "1px solid #cbd5e1",
  padding: "7px 12px",
  fontWeight: 700,
  fontSize: 13,
  textAlign: "center",
  whiteSpace: "nowrap",
  color: "#334155",
};
const td: React.CSSProperties = { border: "1px solid #cbd5e1", padding: "7px 12px", fontSize: 13, color: "#111" };

function Logo() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/samkoo.png" alt="Samkoo" style={{ height: 38, width: "auto", display: "block" }} />;
}

// 페이지 상단 제목 + 로고
function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
      <div>
        <h1 style={{ fontSize: 25, fontWeight: 800, color: NAVY, margin: 0 }}>{title}</h1>
        {subtitle && <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{subtitle}</div>}
      </div>
      <Logo />
    </div>
  );
}

// 섹션/특이사항 페이지용 컴팩트 정보표 (촬영 개요)
function InfoTableCompact({ schedule }: { schedule: Schedule }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginBottom: 12 }}>
      <tbody>
        <tr>
          <th style={{ ...th, width: 92 }}>촬영종류</th>
          <td style={td}>{schedule.shootType || "-"}</td>
          <th style={{ ...th, width: 92 }}>촬영명</th>
          <td style={td}>{schedule.title}</td>
          <th style={{ ...th, width: 92 }}>제작사</th>
          <td style={td}>{schedule.production || "-"}</td>
        </tr>
        <tr>
          <th style={{ ...th, width: 92 }}>관리자</th>
          <td style={td}>{schedule.manager || "-"}</td>
          <th style={{ ...th, width: 92 }}>보양 및 세팅</th>
          <td style={td}>{setupRange(schedule)}</td>
          <th style={{ ...th, width: 92 }}>촬영 및 철수</th>
          <td style={td}>{shootRange(schedule)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function PhotoCell({ photo, index }: { photo: Photo | null; index: number }) {
  return (
    <div style={{ position: "relative", border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden", background: "#f8fafc" }}>
      <span
        style={{
          position: "absolute",
          top: 5,
          left: 5,
          zIndex: 2,
          background: "rgba(15,44,92,0.9)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          width: 18,
          height: 18,
          borderRadius: 4,
          textAlign: "center",
          lineHeight: "18px",
        }}
      >
        {index + 1}
      </span>
      {photo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxied(photo.url)} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          {photo.caption && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(15,23,42,0.72)", color: "#fff", fontSize: 11, padding: "3px 6px" }}>
              {photo.caption}
            </div>
          )}
        </>
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: 12 }}>
          사진 없음
        </div>
      )}
    </div>
  );
}

function pagesOf(photos: Photo[]): Photo[][] {
  if (photos.length === 0) return [[]];
  const out: Photo[][] = [];
  for (let i = 0; i < photos.length; i += PER_PAGE) out.push(photos.slice(i, i + PER_PAGE));
  return out;
}

const ReportDocument = forwardRef<HTMLDivElement, Props>(function ReportDocument({ schedule, report, rounds }, ref) {
  const roundList = (rounds && rounds.length ? rounds : [schedule]);
  const currentIdx = Math.max(0, roundList.findIndex((r) => r.id === schedule.id));
  const sectionPages: { section: ReportSection; photos: Photo[]; part: number; parts: number }[] = [];
  for (const sec of SECTION_ORDER) {
    const groups = pagesOf(report.sections[sec] ?? []);
    groups.forEach((g, i) => sectionPages.push({ section: sec, photos: g, part: i + 1, parts: groups.length }));
  }

  const coverImg = report.cover ? proxied(report.cover.url) : "/cover-building.jpg";
  const specialCells: (Photo | null)[] = Array.from({ length: 4 }, (_, i) => report.specialPhotos?.[i] ?? null);
  const specialNote = report.specialNote?.trim();
  const subtitle = `촬영 기간 : ${shootPeriod(schedule)}`;

  return (
    <div ref={ref} style={{ fontFamily: "var(--font-noto), 'Malgun Gothic', sans-serif" }}>
      {/* ── 1. 겉표지 ─────────────────────────────── */}
      <div className="pdf-page" style={{ ...pageBase, padding: 0, position: "relative", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverImg} alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        {/* 좌측 네이비 그라디언트 */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, rgba(9,24,51,0.94) 0%, rgba(12,33,72,0.82) 34%, rgba(15,44,92,0.35) 60%, rgba(15,44,92,0) 82%)" }} />
        {/* 상단 로고 (투명 배경) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/samkoo.png" alt="Samkoo" style={{ position: "absolute", top: 36, right: 44, height: 46, width: "auto" }} />
        {/* 텍스트 블록 */}
        <div style={{ position: "absolute", left: 60, top: 0, bottom: 0, width: 640, display: "flex", flexDirection: "column", justifyContent: "center", color: "#fff" }}>
          <div style={{ fontSize: 16, letterSpacing: 3, color: "#cfe0f5", fontWeight: 600 }}>제넥신 · 프로젠</div>
          <div style={{ fontSize: 15, letterSpacing: 2, color: "#9db8dd", marginTop: 4 }}>{schedule.shootType || "촬영"}</div>
          <h1 style={{ fontSize: 58, fontWeight: 800, margin: "14px 0 6px", lineHeight: 1.1 }}>촬영 완료보고서</h1>
          <div style={{ fontSize: 30, fontWeight: 600, color: "#eaf1fb" }}>{schedule.title}</div>
          <div style={{ width: 90, height: 4, background: "#4f86d6", borderRadius: 2, margin: "24px 0" }} />
          <div style={{ fontSize: 16, color: "#dbe6f6", lineHeight: 1.8 }}>
            <div>제작사 : {schedule.production || "-"}</div>
            <div>촬영 기간 : {shootPeriod(schedule)}</div>
            {schedule.manager && <div>관리자 : {schedule.manager}</div>}
          </div>
        </div>
        {/* 하단 액센트 바 */}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 8, background: `linear-gradient(90deg, ${NAVY}, #4f86d6)` }} />
      </div>

      {/* ── 2. 촬영 개요 ─────────────────────────── */}
      <div className="pdf-page" style={pageBase}>
        <PageHeader title="촬영 개요" subtitle="촬영 완료보고서 · 개요 안내" />

        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <tbody>
            {[
              ["촬영종류", schedule.shootType || "-", "촬영명", schedule.title],
              ["제작사", schedule.production || "-", "관리자", schedule.manager || "-"],
              ["촬영 일시", prettyDateTime(schedule.start), "촬영 기간", shootPeriod(schedule)],
              ["보양 및 세팅", setupRange(schedule), "촬영 및 철수", shootRange(schedule)],
            ].map((row, i) => (
              <tr key={i}>
                <th style={{ ...th, width: 150, fontSize: 15, padding: "14px 14px" }}>{row[0]}</th>
                <td style={{ ...td, fontSize: 15, padding: "14px 14px" }}>{row[1]}</td>
                <th style={{ ...th, width: 150, fontSize: 15, padding: "14px 14px" }}>{row[2]}</th>
                <td style={{ ...td, fontSize: 15, padding: "14px 14px" }}>{row[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 촬영 회차 (같은 촬영명 자동 집계) */}
        <div style={{ marginTop: 26, flex: 1, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 5, height: 18, background: NAVY, borderRadius: 2, display: "inline-block" }} />
              <span style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>촬영 회차</span>
            </div>
            <span style={{ fontSize: 13, color: "#64748b" }}>
              총 {roundList.length}회차 · 이번은 <b style={{ color: NAVY }}>{currentIdx + 1}번째</b> 촬영
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 80 }}>회차</th>
                <th style={th}>촬영 일시</th>
                <th style={{ ...th, width: 260 }}>촬영 및 철수</th>
                <th style={{ ...th, width: 130 }}>관리자</th>
                <th style={{ ...th, width: 120 }}>비고</th>
              </tr>
            </thead>
            <tbody>
              {roundList.map((r, i) => {
                const isNow = i === currentIdx;
                const rowTd: React.CSSProperties = {
                  ...td,
                  textAlign: "center",
                  background: isNow ? "#e8f0fb" : "#fff",
                  fontWeight: isNow ? 700 : 400,
                };
                return (
                  <tr key={r.id}>
                    <td style={{ ...rowTd, fontWeight: 700, color: NAVY }}>{i + 1}회차</td>
                    <td style={{ ...rowTd, textAlign: "left" }}>{prettyDateTime(r.start)}</td>
                    <td style={{ ...rowTd, textAlign: "left" }}>{shootRange(r)}</td>
                    <td style={rowTd}>{r.manager || "-"}</td>
                    <td style={rowTd}>
                      {isNow ? (
                        <span style={{ background: NAVY, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>
                          이번 촬영
                        </span>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 3~. 섹션 페이지 (정보표 + 4×2 사진 + 하단 특이사항) ── */}
      {sectionPages.map((pg, idx) => {
        const note = report.sectionNotes?.[pg.section]?.trim();
        const cells: (Photo | null)[] = Array.from({ length: PER_PAGE }, (_, i) => pg.photos[i] ?? null);
        return (
          <div key={idx} className="pdf-page" style={pageBase}>
            <PageHeader title="촬영 완료보고서" subtitle={subtitle} />
            <InfoTableCompact schedule={schedule} />

            {/* 섹션 배지 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ background: NAVY, color: "#fff", fontSize: 14, fontWeight: 700, padding: "4px 14px", borderRadius: 4 }}>
                {SECTION_LABELS[pg.section]}
              </span>
              {pg.parts > 1 && <span style={{ fontSize: 12, color: "#94a3b8" }}>({pg.part}/{pg.parts})</span>}
            </div>

            {/* 4×2 사진 */}
            <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "1fr 1fr", gap: 8 }}>
              {cells.map((p, i) => (
                <PhotoCell key={i} photo={p} index={i} />
              ))}
            </div>

            {/* 하단 특이사항 */}
            <div style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ background: "#eef2f7", padding: "6px 12px", fontWeight: 700, fontSize: 13, color: "#334155" }}>
                촬영 중 특이사항 · 비고
              </div>
              <div style={{ padding: "10px 12px", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", color: note ? "#111" : "#94a3b8", height: 70, overflow: "hidden" }}>
                {note || "해당 없음"}
              </div>
            </div>
          </div>
        );
      })}

      {/* ── 마지막. 특이사항 (사진 2×2 + 우측 설명) ── */}
      <div className="pdf-page" style={pageBase}>
        <PageHeader title="특이사항" subtitle={subtitle} />
        <InfoTableCompact schedule={schedule} />
        <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
          {/* 좌: 2×2 사진 */}
          <div style={{ flex: "0 0 64%", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 10 }}>
            {specialCells.map((p, i) => (
              <PhotoCell key={i} photo={p} index={i} />
            ))}
          </div>
          {/* 우: 특이사항 설명 */}
          <div style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ background: "#eef2f7", padding: "8px 12px", fontWeight: 700, fontSize: 14, color: "#334155", borderBottom: "1px solid #e2e8f0" }}>
              특이사항 설명
            </div>
            <div style={{ padding: 12, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", color: specialNote ? "#111" : "#94a3b8", flex: 1, overflow: "hidden" }}>
              {specialNote || "해당 없음"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ReportDocument;
