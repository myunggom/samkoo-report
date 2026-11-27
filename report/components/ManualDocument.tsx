"use client";

import { forwardRef } from "react";
import {
  CONTENT_W,
  LAYOUT,
  LAYOUT_CAP,
  LAYOUT_NOTE_LABEL,
  PAGE_BOTTOM,
  allSteps,
  cellXY,
  coverImage,
  displayTitle,
  dotDate,
  gridBox,
  stepStarts,
  type Manual,
  type ManualPage,
  type ManualStep,
} from "@/lib/manual";
import { proxied } from "@/lib/client";

// 작동 매뉴얼 PDF — A4 가로(1123×794) 쪽을 좌표로 그대로 그린다.
// PPT(lib/manualPptx.ts)가 같은 좌표(lib/manual.ts LAYOUT)를 읽으므로 두 출력이 같은 모양이다.

const L = LAYOUT;
const c = (hex: string) => `#${hex}`;

const pageStyle: React.CSSProperties = {
  width: L.PAGE_W,
  height: L.PAGE_H,
  background: "#fff",
  color: c(L.INK),
  boxSizing: "border-box",
  position: "relative",
  overflow: "hidden",
};

function Abs({ x, y, w, h, style, children }: { x: number; y: number; w: number; h: number; style?: React.CSSProperties; children?: React.ReactNode }) {
  return <div style={{ position: "absolute", left: x, top: y, width: w, height: h, boxSizing: "border-box", ...style }}>{children}</div>;
}

function Logo({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/samkoo.png" alt="Samkoo" style={{ position: "absolute", left: x, top: y, width: w, height: h, objectFit: "contain" }} />;
}

// 쪽 머리 — 네이비 제목 + 회색 부제 + 오른쪽 로고
function PageHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <Abs
        x={L.PAD}
        y={L.TITLE_Y}
        w={700}
        h={L.TITLE_H}
        style={{ display: "flex", alignItems: "center", fontSize: 25, fontWeight: 800, color: c(L.NAVY), letterSpacing: -0.3 }}
      >
        {title}
      </Abs>
      <Abs x={L.PAD} y={L.SUB_Y} w={900} h={L.SUB_H} style={{ display: "flex", alignItems: "center", fontSize: 12, color: c(L.MUTED) }}>
        {subtitle}
      </Abs>
      <Logo {...L.LOGO} />
    </>
  );
}

// ── 1. 표지 ────────────────────────────────────────────────────────
function Cover({ m }: { m: Manual }) {
  const photoY = L.COVER_Y;
  const photoH = L.PAGE_H - photoY;
  const lines: [string, string][] = [
    ["대상 설비", m.equipment || "-"],
    ["설치 위치", m.location || "-"],
    ["작성", `${m.author || "-"}   ·   ${dotDate(m.date)}`],
  ];
  return (
    <div className="pdf-page" style={pageStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxied(coverImage(m))}
        alt=""
        crossOrigin="anonymous"
        style={{ position: "absolute", left: 0, top: photoY, width: L.PAGE_W, height: photoH, objectFit: "cover" }}
      />
      <Logo {...L.COVER_LOGO} />
      <Abs x={60} y={60.7} w={700} h={24} style={{ display: "flex", alignItems: "center", fontSize: 16, fontWeight: 700, letterSpacing: 3, color: c(L.INK) }}>
        {m.building}
      </Abs>
      <Abs x={60} y={125.2} w={900} h={63.8} style={{ display: "flex", alignItems: "center", fontSize: 58, fontWeight: 800, color: c(L.INK) }}>
        작동 매뉴얼
      </Abs>
      <Abs x={60} y={197} w={900} h={34} style={{ display: "flex", alignItems: "center", fontSize: 26, fontWeight: 700, color: c(L.NAVY) }}>
        {displayTitle(m)}
      </Abs>
      <Abs x={60} y={243} w={90} h={4} style={{ background: c(L.BLUE), borderRadius: 2 }} />
      {lines.map(([k, v], i) => (
        <Abs
          key={k}
          x={60}
          y={266 + i * 34}
          w={900}
          h={28.8}
          style={{ display: "flex", alignItems: "center", fontSize: 16, color: c(L.INK) }}
        >
          <span style={{ color: c(L.MUTED), width: 92, display: "inline-block" }}>{k}</span>
          <span>{v}</span>
        </Abs>
      ))}
      <Abs x={0} y={L.PAGE_H - L.BAR_H} w={L.PAGE_W} h={L.BAR_H} style={{ background: `linear-gradient(90deg, ${c(L.NAVY)}, ${c(L.BLUE)})` }} />
    </div>
  );
}

// ── 2. 개요 ────────────────────────────────────────────────────────
const INFO_ROW_H = 51.5;

function InfoCell({ x, y, w, h, label, value }: { x: number; y: number; w: number; h: number; label?: string; value?: string }) {
  const isHead = label !== undefined;
  return (
    <Abs
      x={x}
      y={y}
      w={w}
      h={h}
      style={{
        border: `1px solid ${c(L.TLINE)}`,
        background: isHead ? c(L.HEAD_FILL) : "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: isHead ? "center" : "flex-start",
        padding: "0 14px",
        fontSize: 15,
        fontWeight: isHead ? 700 : 400,
        color: isHead ? c(L.HEAD_INK) : c(L.INK),
        whiteSpace: "pre-wrap",
        lineHeight: 1.35,
        overflow: "hidden",
      }}
    >
      {isHead ? label : value || "-"}
    </Abs>
  );
}

function Overview({ m }: { m: Manual }) {
  const steps = allSteps(m.pages);
  const pairRows: [string, string, string, string][] = [
    ["대상 설비", m.equipment, "설치 위치", m.location],
    ["구분", m.category, "대상 건물", m.building],
    ["작성자", m.author, "작성일", dotDate(m.date)],
  ];
  const wideRows: [string, string][] = [["용도 · 목적", m.purpose]];
  if (m.caution.trim()) wideRows.push(["주의사항", m.caution]);

  const TH_W = 150;
  const TD_W = (CONTENT_W - TH_W * 2) / 2;
  const tableY = L.BADGE_Y;
  const rowCount = pairRows.length + wideRows.length;
  const tableH = rowCount * INFO_ROW_H;

  // 「작동 순서」 — 남은 자리에 두 줄로 나눠 넣는다
  const secY = tableY + tableH + 26;
  const listY = secY + 32.5;
  const listH = PAGE_BOTTOM - listY;
  const rows = Math.max(1, Math.ceil(steps.length / 2));
  const lineH = Math.min(30, listH / Math.max(rows + 1, 1));
  const font = lineH >= 26 ? 13 : lineH >= 21 ? 12 : lineH >= 17 ? 11 : 10;
  const colW = (CONTENT_W - 16) / 2;

  return (
    <div className="pdf-page" style={pageStyle}>
      <PageHead title="매뉴얼 개요" subtitle={`${displayTitle(m)} · 전체 ${steps.length}단계 · ${m.pages.length}쪽`} />

      {pairRows.map(([a, va, b, vb], i) => {
        const y = tableY + i * INFO_ROW_H;
        return (
          <div key={a}>
            <InfoCell x={L.PAD} y={y} w={TH_W} h={INFO_ROW_H} label={a} />
            <InfoCell x={L.PAD + TH_W} y={y} w={TD_W} h={INFO_ROW_H} value={va} />
            <InfoCell x={L.PAD + TH_W + TD_W} y={y} w={TH_W} h={INFO_ROW_H} label={b} />
            <InfoCell x={L.PAD + TH_W * 2 + TD_W} y={y} w={TD_W} h={INFO_ROW_H} value={vb} />
          </div>
        );
      })}
      {wideRows.map(([a, va], i) => {
        const y = tableY + (pairRows.length + i) * INFO_ROW_H;
        return (
          <div key={a}>
            <InfoCell x={L.PAD} y={y} w={TH_W} h={INFO_ROW_H} label={a} />
            <InfoCell x={L.PAD + TH_W} y={y} w={CONTENT_W - TH_W} h={INFO_ROW_H} value={va} />
          </div>
        );
      })}

      {/* 작동 순서 */}
      <Abs x={L.PAD} y={secY + 3.8} w={5} h={18} style={{ background: c(L.NAVY), borderRadius: 2 }} />
      <Abs x={L.PAD + 13} y={secY} w={400} h={25.5} style={{ display: "flex", alignItems: "center", fontSize: 17, fontWeight: 800, color: c(L.NAVY) }}>
        작동 순서
      </Abs>
      <Abs
        x={L.PAD + 420}
        y={secY + 3}
        w={CONTENT_W - 420}
        h={19.5}
        style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", fontSize: 13, color: c(L.MUTED) }}
      >
        사진 번호와 같은 순서입니다
      </Abs>

      {steps.length === 0 ? (
        <Abs x={L.PAD} y={listY} w={CONTENT_W} h={40} style={{ display: "flex", alignItems: "center", fontSize: 13, color: c(L.FAINT) }}>
          아직 등록된 단계가 없습니다.
        </Abs>
      ) : (
        steps.map((s, i) => {
          const col = i < rows ? 0 : 1;
          const row = i < rows ? i : i - rows;
          return (
            <Abs
              key={s.n}
              x={L.PAD + col * (colW + 16)}
              y={listY + row * lineH}
              w={colW}
              h={lineH}
              style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${c(L.LINE)}`, overflow: "hidden" }}
            >
              <span
                style={{
                  flex: "0 0 auto",
                  background: c(L.NAVY),
                  color: "#fff",
                  fontSize: font - 2,
                  fontWeight: 700,
                  minWidth: 22,
                  height: 18,
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                }}
              >
                {s.n}
              </span>
              <span style={{ fontSize: font, color: c(L.INK), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.text}</span>
            </Abs>
          );
        })
      )}
    </div>
  );
}

// ── 3. 사진 쪽 ─────────────────────────────────────────────────────
function StepCell({ x, y, w, h, photoH, step, n }: { x: number; y: number; w: number; h: number; photoH: number; step: ManualStep | null; n: number }) {
  // 빈 칸은 번호도 설명도 붙이지 않는다 — 단계 수와 번호가 어긋나면 안 된다
  if (!step) {
    return (
      <Abs
        x={x}
        y={y}
        w={w}
        h={h}
        style={{
          border: `1px solid ${c(L.LINE)}`,
          borderRadius: 6,
          background: c(L.SLOT),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          color: c(L.SLOT_INK),
        }}
      >
        사진 없음
      </Abs>
    );
  }
  return (
    <Abs x={x} y={y} w={w} h={h} style={{ border: `1px solid ${c(L.LINE)}`, borderRadius: 6, overflow: "hidden", background: "#fff" }}>
      <div style={{ position: "relative", width: "100%", height: photoH, background: c(L.SLOT), overflow: "hidden" }}>
        {step.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proxied(step.url)} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: c(L.SLOT_INK) }}>
            사진 없음
          </div>
        )}
        <span
          style={{
            position: "absolute",
            left: 6,
            top: 6,
            width: L.NUM,
            height: L.NUM,
            borderRadius: 4,
            background: c(L.NAVY),
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {n}
        </span>
      </div>
      <div
        style={{
          height: L.CAP_H,
          borderTop: `1px solid ${c(L.LINE)}`,
          padding: "4px 8px",
          fontSize: 12,
          lineHeight: 1.3,
          color: step.caption ? c(L.INK) : c(L.FAINT),
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {step.caption?.trim() || "설명 없음"}
        </span>
      </div>
    </Abs>
  );
}

function NoteBox({ x, y, w, h, label, text }: { x: number; y: number; w: number; h: number; label: string; text: string }) {
  return (
    <Abs x={x} y={y} w={w} h={h} style={{ border: `1px solid ${c(L.LINE)}`, borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      <div style={{ height: L.NOTE_HEAD_H, background: c(L.HEAD_FILL), display: "flex", alignItems: "center", padding: "0 12px", fontSize: 13, fontWeight: 700, color: c(L.HEAD_INK) }}>
        {label}
      </div>
      <div
        style={{
          padding: "10px 12px",
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          color: text.trim() ? c(L.INK) : c(L.FAINT),
          height: h - L.NOTE_HEAD_H,
          overflow: "hidden",
        }}
      >
        {text.trim() || "해당 없음"}
      </div>
    </Abs>
  );
}

function PhotoPage({ m, page, start, index, total }: { m: Manual; page: ManualPage; start: number; index: number; total: number }) {
  const g = gridBox(page.layout);
  const cap = LAYOUT_CAP[page.layout];
  const cells: (ManualStep | null)[] = Array.from({ length: cap }, (_, i) => page.steps[i] ?? null);
  const last = start + Math.max(page.steps.length, 1) - 1;
  const range = page.steps.length ? `${start} ~ ${last}단계` : "단계 없음";
  const badge = page.heading.trim() || `${index + 1}쪽`;

  return (
    <div className="pdf-page" style={pageStyle}>
      <PageHead title={displayTitle(m)} subtitle={`${m.equipment || m.building} · ${dotDate(m.date)}`} />

      {/* 쪽 이름 배지 */}
      <Abs
        x={L.PAD}
        y={L.BADGE_Y}
        w={Math.max(100, badge.length * 15 + 28)}
        h={L.BADGE_H}
        style={{ background: c(L.NAVY), borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700 }}
      >
        {badge}
      </Abs>
      <Abs
        x={L.PAD + Math.max(100, badge.length * 15 + 28) + 10}
        y={L.BADGE_Y + 5.5}
        w={300}
        h={18}
        style={{ display: "flex", alignItems: "center", fontSize: 12, color: c(L.FAINT) }}
      >
        {range}
      </Abs>
      <Abs
        x={L.PAD + CONTENT_W - 200}
        y={L.BADGE_Y + 5.5}
        w={200}
        h={18}
        style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", fontSize: 12, color: c(L.FAINT) }}
      >
        {index + 1} / {total}
      </Abs>

      {cells.map((s, i) => {
        const p = cellXY(page.layout, i);
        return <StepCell key={i} x={p.x} y={p.y} w={p.w} h={p.h} photoH={g.photoH} step={s} n={start + i} />;
      })}

      {g.note && <NoteBox {...g.note} label={LAYOUT_NOTE_LABEL[page.layout]} text={page.note} />}
      {g.panel && <NoteBox {...g.panel} label={LAYOUT_NOTE_LABEL[page.layout]} text={page.note} />}
    </div>
  );
}

// ── 문서 ───────────────────────────────────────────────────────────
const ManualDocument = forwardRef<HTMLDivElement, { manual: Manual }>(function ManualDocument({ manual }, ref) {
  const starts = stepStarts(manual.pages);
  return (
    <div ref={ref} style={{ fontFamily: "var(--font-noto), 'Malgun Gothic', sans-serif" }}>
      <Cover m={manual} />
      {manual.overview && <Overview m={manual} />}
      {manual.pages.map((p, i) => (
        <PhotoPage key={p.id} m={manual} page={p} start={starts[i]} index={i} total={manual.pages.length} />
      ))}
    </div>
  );
});

export default ManualDocument;
