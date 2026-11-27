"use client";

import { forwardRef } from "react";
import {
  CONTENT_W,
  LAYOUT,
  LAYOUT_CAP,
  LAYOUT_NOTE_LABEL,
  PAGE_BOTTOM,
  allSteps,
  badgeWidth,
  capBoxWidth,
  cellXY,
  fitCaption,
  coverImage,
  displayTitle,
  dotDate,
  gridBox,
  infoPairs,
  stepStarts,
  type Manual,
  type ManualPage,
  type ManualStep,
} from "@/lib/manual";
import { proxied } from "@/lib/client";

// 작동 매뉴얼 PDF — 1사옥 보고 PPT 양식(lib/manual.ts 머리글 참고)을 좌표 그대로 그린다.
// PPT(lib/manualPptx.ts)가 같은 좌표를 읽으므로 두 출력이 같은 모양이다.

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
      <Abs x={L.PAD} y={L.TITLE_Y} w={700} h={L.TITLE_H} style={{ display: "flex", alignItems: "center", fontSize: 25, fontWeight: 800, color: c(L.NAVY), letterSpacing: 0.5 }}>
        {title}
      </Abs>
      <Abs x={L.PAD} y={L.SUB_Y} w={900} h={L.SUB_H} style={{ display: "flex", alignItems: "center", fontSize: 12, color: c(L.MUTED) }}>
        {subtitle}
      </Abs>
      <Logo {...L.LOGO} />
    </>
  );
}

// 표 한 칸
function Cell({ x, y, w, h, head, text, size = 12 }: { x: number; y: number; w: number; h: number; head?: boolean; text: string; size?: number }) {
  return (
    <Abs
      x={x}
      y={y}
      w={w}
      h={h}
      style={{
        border: `1px solid ${c(L.TLINE)}`,
        background: head ? c(L.HEAD_FILL) : "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: head ? "center" : "flex-start",
        padding: head ? 0 : "0 14px",
        fontSize: size,
        fontWeight: head ? 700 : 400,
        color: head ? c(L.HEAD_INK) : c(L.INK),
        letterSpacing: head ? 1 : 0,
        whiteSpace: "pre-wrap",
        lineHeight: 1.45,
        overflow: "hidden",
      }}
    >
      {text}
    </Abs>
  );
}

// 모든 내용 쪽 위쪽 2행 표 (대상 / 위치 / 구분 / 작성)
function InfoTable({ m, y }: { m: Manual; y: number }) {
  const TH = L.INFO_TH_W;
  const TD = (CONTENT_W - TH * 2) / 2;
  const H = L.INFO_ROW_H;
  return (
    <>
      {infoPairs(m).map(([a, va, b, vb], i) => {
        const ry = y + i * H;
        return (
          <div key={a}>
            <Cell x={L.PAD} y={ry} w={TH} h={H} head text={a} />
            <Cell x={L.PAD + TH} y={ry} w={TD} h={H} text={va} />
            <Cell x={L.PAD + TH + TD} y={ry} w={TH} h={H} head text={b} />
            <Cell x={L.PAD + TH * 2 + TD} y={ry} w={TD} h={H} text={vb} />
          </div>
        );
      })}
    </>
  );
}

// 네이비 배지 + 오른쪽 회색 설명
function Badge({ y, text, hint, right }: { y: number; text: string; hint?: string; right?: string }) {
  const w = badgeWidth(text);
  return (
    <>
      <Abs
        x={L.PAD}
        y={y}
        w={w}
        h={L.BADGE_H}
        style={{ background: c(L.NAVY), borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: 2 }}
      >
        {text}
      </Abs>
      {hint && (
        <Abs x={L.PAD + w + L.BADGE_GAP} y={y} w={700} h={L.BADGE_H} style={{ display: "flex", alignItems: "center", fontSize: 12, color: c(L.MUTED) }}>
          {hint}
        </Abs>
      )}
      {right && (
        <Abs x={L.PAD + CONTENT_W - 200} y={y} w={200} h={L.BADGE_H} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", fontSize: 12, color: c(L.FAINT) }}>
          {right}
        </Abs>
      )}
    </>
  );
}

// 아래(또는 오른쪽) 설명 상자
function NoteBox({ x, y, w, h, label, text }: { x: number; y: number; w: number; h: number; label: string; text: string }) {
  return (
    <Abs x={x} y={y} w={w} h={h} style={{ border: `1px solid ${c(L.LINE)}`, borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      <div style={{ height: L.NOTE_HEAD_H, background: c(L.HEAD_FILL), display: "flex", alignItems: "center", padding: "0 13px", fontSize: 13, fontWeight: 700, color: c(L.HEAD_INK) }}>
        {label}
      </div>
      <div
        style={{
          padding: "10px 13px",
          fontSize: 12,
          lineHeight: 1.7,
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

// ── 1. 표지 ────────────────────────────────────────────────────────
function Cover({ m }: { m: Manual }) {
  const photoH = L.PAGE_H - L.COVER_Y;
  const lines: [string, string][] = [
    ["대상", [m.equipment, m.location].filter(Boolean).join(" · ") || "-"],
    ["구분", m.category || "-"],
    ["작성일", dotDate(m.date)],
    ["작성", m.author || "-"],
  ];
  return (
    <div className="pdf-page" style={pageStyle}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proxied(coverImage(m))}
        alt=""
        crossOrigin="anonymous"
        style={{ position: "absolute", left: 0, top: L.COVER_Y, width: L.PAGE_W, height: photoH, objectFit: "cover" }}
      />
      <Logo {...L.COVER_LOGO} />
      <Abs x={L.COVER_X} y={L.COVER_BLD_Y} w={700} h={24} style={{ display: "flex", alignItems: "center", fontSize: 16, fontWeight: 700, letterSpacing: 3, color: c(L.NAVY) }}>
        {m.building}
      </Abs>
      <Abs x={L.COVER_X} y={L.COVER_TITLE_Y} w={960} h={63.8} style={{ display: "flex", alignItems: "center", fontSize: 58, fontWeight: 800, color: c(L.NAVY), letterSpacing: -1, whiteSpace: "nowrap", overflow: "hidden" }}>
        {displayTitle(m)}
      </Abs>
      {lines.map(([k, v], i) => (
        <Abs key={k} x={L.COVER_X} y={L.COVER_LINE_Y[i]} w={960} h={28.8} style={{ display: "flex", alignItems: "center", fontSize: 16, color: c(L.SLATE) }}>
          {k} : {v}
        </Abs>
      ))}
      <Abs x={0} y={L.BAR_Y} w={L.PAGE_W} h={L.BAR_H} style={{ background: c(L.NAVY) }} />
    </div>
  );
}

// ── 2. 개요 ────────────────────────────────────────────────────────
function Overview({ m }: { m: Manual }) {
  const steps = allSteps(m.pages);
  const wide: [string, string][] = [["용 도 · 목 적", m.purpose || "-"]];
  if (m.caution.trim()) wide.push(["주 의 사 항", m.caution]);

  const TH = L.INFO_TH_W;
  const pairH = L.INFO_ROW_H * 2;
  const wideY = L.INFO_Y + pairH;
  const tableH = pairH + wide.length * L.INFO_WIDE_H;

  const badgeY = L.INFO_Y + tableH + 14;
  const listY = badgeY + L.BADGE_H + 14;
  const listH = PAGE_BOTTOM - listY;
  const rows = Math.max(1, Math.ceil(steps.length / 2));
  const lineH = Math.min(30, listH / (rows + 0.2));
  const font = lineH >= 26 ? 13 : lineH >= 21 ? 12 : lineH >= 17 ? 11 : 10;
  const colW = (CONTENT_W - 20) / 2;

  return (
    <div className="pdf-page" style={pageStyle}>
      <PageHead title="매뉴얼 개요" subtitle={`${displayTitle(m)} · 전체 ${steps.length}단계 · ${m.pages.length}쪽`} />
      <InfoTable m={m} y={L.INFO_Y} />
      {wide.map(([k, v], i) => {
        const y = wideY + i * L.INFO_WIDE_H;
        return (
          <div key={k}>
            <Cell x={L.PAD} y={y} w={TH} h={L.INFO_WIDE_H} head text={k} />
            <Cell x={L.PAD + TH} y={y} w={CONTENT_W - TH} h={L.INFO_WIDE_H} text={v} />
          </div>
        );
      })}

      <Badge y={badgeY} text="작동 순서" hint="사진에 붙은 번호와 같은 순서입니다" />

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
              x={L.PAD + col * (colW + 20)}
              y={listY + row * lineH}
              w={colW}
              h={lineH}
              style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: `1px solid ${c(L.LINE)}`, overflow: "hidden" }}
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
// 양식: 둥근 회색 틀에 사진을 꽉 채우고, 사진 아래쪽에 검정 75% 띠 + 흰 글씨로 「① 설명」
function StepCell({ x, y, w, h, step, n }: { x: number; y: number; w: number; h: number; step: ManualStep | null; n: number }) {
  const cap = fitCaption(step?.caption?.trim() || "설명 없음", capBoxWidth(w));
  return (
    <Abs x={x} y={y} w={w} h={h} style={{ border: `1px solid ${c(L.LINE)}`, borderRadius: 6, overflow: "hidden", background: c(L.SLOT) }}>
      {step?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxied(step.url)} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: c(L.SLOT_INK) }}>사진 없음</div>
      )}
      {step && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: L.CAP_BAR_H,
            background: `rgba(0,0,0,${L.CAP_ALPHA})`,
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "0 11px",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              flex: "0 0 auto",
              width: L.NUM,
              height: L.NUM,
              borderRadius: "50%",
              border: "1px solid #fff",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {n}
          </span>
          <span style={{ fontSize: cap.size, fontWeight: 700, color: "#fff", letterSpacing: 0.4, whiteSpace: "nowrap", overflow: "hidden" }}>
            {cap.text}
          </span>
        </div>
      )}
    </Abs>
  );
}

function PhotoPage({ m, page, start, index, total }: { m: Manual; page: ManualPage; start: number; index: number; total: number }) {
  const g = gridBox(page.layout);
  const cap = LAYOUT_CAP[page.layout];
  const cells: (ManualStep | null)[] = Array.from({ length: cap }, (_, i) => page.steps[i] ?? null);
  const last = start + Math.max(page.steps.length, 1) - 1;

  return (
    <div className="pdf-page" style={pageStyle}>
      <PageHead title={displayTitle(m)} subtitle={m.purpose?.trim() || m.building} />
      <InfoTable m={m} y={L.INFO_Y} />
      <Badge
        y={L.BADGE_Y}
        text={page.heading.trim() || `${index + 1}쪽`}
        hint={page.steps.length ? `${start} ~ ${last}단계` : "단계 없음"}
        right={`${index + 1} / ${total}`}
      />
      {cells.map((s, i) => {
        const p = cellXY(page.layout, i);
        return <StepCell key={i} x={p.x} y={p.y} w={p.w} h={p.h} step={s} n={start + i} />;
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
