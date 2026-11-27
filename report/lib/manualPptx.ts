"use client";

// 작동 매뉴얼 → PPT(.pptx). 브라우저에서 pptxgenjs 로 만든다.
//
// 좌표·색은 lib/manual.ts 의 LAYOUT 을 PDF(components/ManualDocument.tsx)와 함께 읽는다.
// 그래서 PPT 와 PDF 가 같은 모양으로 나온다. 양식을 고칠 때는 LAYOUT 한 곳만 고치면 된다.
//
// px → 인치 : /96  (A4 가로 1123×794px = 11.70×8.27in)
// px → pt   : ×0.75

import type PptxGenJS from "pptxgenjs";
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
  manualFileName,
  stepStarts,
  type Manual,
  type ManualPage,
} from "@/lib/manual";
import { proxied } from "@/lib/client";

const L = LAYOUT;
const FONT = "맑은 고딕";
const IN = (px: number) => px / 96;
const PT = (px: number) => px * 0.75;

type Img = { data: string; w: number; h: number };
type Slide = PptxGenJS.Slide;
type Box = { x: number; y: number; w: number; h: number };

// ── 사진 읽기 ──────────────────────────────────────────────────────
// 가로세로 비율을 알아야 pptxgenjs 가 「잘라 채우기(cover)」를 계산할 수 있다.
async function loadImage(url: string): Promise<Img | null> {
  try {
    const res = await fetch(proxied(url));
    if (!res.ok) return null;
    const blob = await res.blob();
    const [data, size] = await Promise.all([
      new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      }),
      createImageBitmap(blob)
        .then((b) => ({ w: b.width, h: b.height }))
        .catch(() => ({ w: 4, h: 3 })),
    ]);
    return { data, w: size.w, h: size.h };
  } catch {
    return null;
  }
}

async function loadAll(urls: string[]): Promise<Map<string, Img>> {
  const uniq = Array.from(new Set(urls.filter(Boolean)));
  const got = await Promise.all(uniq.map(loadImage));
  const map = new Map<string, Img>();
  uniq.forEach((u, i) => {
    const img = got[i];
    if (img) map.set(u, img);
  });
  return map;
}

// ── 그리기 helper ─────────────────────────────────────────────────
function rect(
  slide: Slide,
  pptx: PptxGenJS,
  b: Box,
  o: { fill?: string; line?: string; lineW?: number; radius?: number } = {},
) {
  slide.addShape(o.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
    x: IN(b.x),
    y: IN(b.y),
    w: IN(b.w),
    h: IN(b.h),
    fill: o.fill ? { color: o.fill } : { type: "none" },
    line: o.line ? { color: o.line, width: o.lineW ?? 0.75 } : { type: "none" },
    ...(o.radius ? { rectRadius: IN(o.radius) } : {}),
  });
}

type TxtOpt = {
  size: number; // px
  color?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  spacing?: number; // 자간(px)
  lineHeight?: number; // 줄 높이(px)
  shrink?: boolean; // 길면 글자를 줄여 칸 안에 넣는다
};

function txt(slide: Slide, text: string, b: Box, o: TxtOpt) {
  slide.addText(text || " ", {
    x: IN(b.x),
    y: IN(b.y),
    w: IN(b.w),
    h: IN(b.h),
    fontFace: FONT,
    fontSize: PT(o.size),
    bold: !!o.bold,
    color: o.color || L.INK,
    align: o.align || "left",
    valign: o.valign || "middle",
    margin: 0,
    isTextBox: true,
    ...(o.spacing ? { charSpacing: PT(o.spacing) } : {}),
    ...(o.lineHeight ? { lineSpacing: PT(o.lineHeight) } : {}),
    ...(o.shrink ? { fit: "shrink" as const } : {}),
  });
}

/** 사진을 칸에 꽉 차게(잘라 채우기) 넣는다. 없으면 회색 빈 칸. */
function photo(slide: Slide, pptx: PptxGenJS, img: Img | undefined, b: Box) {
  if (!img) {
    rect(slide, pptx, b, { fill: L.SLOT });
    txt(slide, "사진 없음", b, { size: 12, color: L.SLOT_INK, align: "center" });
    return;
  }
  slide.addImage({
    data: img.data,
    x: IN(b.x),
    y: IN(b.y),
    w: img.w, // 비율 계산용 — 실제 크기는 sizing 이 정한다
    h: img.h,
    sizing: { type: "cover", w: IN(b.w), h: IN(b.h) },
  });
}

/** 네이비 → 파랑 띠. PPT 는 그라디언트를 못 넣어서 얇게 잘라 색을 이어 붙인다. */
function gradientBar(slide: Slide, pptx: PptxGenJS, y: number, h: number) {
  const from = [0x0f, 0x2c, 0x5c];
  const to = [0x4f, 0x86, 0xd6];
  const n = 24;
  const w = L.PAGE_W / n;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const hex = from
      .map((c0, k) => Math.round(c0 + (to[k] - c0) * t).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    rect(slide, pptx, { x: i * w, y, w: w + 1, h }, { fill: hex });
  }
}

function pageHead(slide: Slide, pptx: PptxGenJS, logo: Img | undefined, title: string, subtitle: string) {
  txt(slide, title, { x: L.PAD, y: L.TITLE_Y, w: 700, h: L.TITLE_H }, { size: 25, bold: true, color: L.NAVY, shrink: true });
  txt(slide, subtitle, { x: L.PAD, y: L.SUB_Y, w: 900, h: L.SUB_H }, { size: 12, color: L.MUTED });
  if (logo) {
    slide.addImage({
      data: logo.data,
      x: IN(L.LOGO.x),
      y: IN(L.LOGO.y),
      w: logo.w,
      h: logo.h,
      sizing: { type: "contain", w: IN(L.LOGO.w), h: IN(L.LOGO.h) },
    });
  }
}

function blank(pptx: PptxGenJS): Slide {
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };
  return s;
}

// ── 1. 표지 ────────────────────────────────────────────────────────
function buildCover(pptx: PptxGenJS, m: Manual, imgs: Map<string, Img>, logo?: Img) {
  const s = blank(pptx);
  const photoH = L.PAGE_H - L.COVER_Y;
  photo(s, pptx, imgs.get(coverImage(m)), { x: 0, y: L.COVER_Y, w: L.PAGE_W, h: photoH });
  if (logo) {
    s.addImage({
      data: logo.data,
      x: IN(L.COVER_LOGO.x),
      y: IN(L.COVER_LOGO.y),
      w: logo.w,
      h: logo.h,
      sizing: { type: "contain", w: IN(L.COVER_LOGO.w), h: IN(L.COVER_LOGO.h) },
    });
  }
  txt(s, m.building, { x: 60, y: 60.7, w: 700, h: 24 }, { size: 16, bold: true, spacing: 3 });
  txt(s, "작동 매뉴얼", { x: 60, y: 125.2, w: 900, h: 63.8 }, { size: 58, bold: true });
  txt(s, displayTitle(m), { x: 60, y: 197, w: 900, h: 34 }, { size: 26, bold: true, color: L.NAVY, shrink: true });
  rect(s, pptx, { x: 60, y: 243, w: 90, h: 4 }, { fill: L.BLUE });

  const lines: [string, string][] = [
    ["대상 설비", m.equipment || "-"],
    ["설치 위치", m.location || "-"],
    ["작성", `${m.author || "-"}   ·   ${dotDate(m.date)}`],
  ];
  lines.forEach(([k, v], i) => {
    const y = 266 + i * 34;
    txt(s, k, { x: 60, y, w: 92, h: 28.8 }, { size: 16, color: L.MUTED });
    txt(s, v, { x: 152, y, w: 800, h: 28.8 }, { size: 16 });
  });
  gradientBar(s, pptx, L.PAGE_H - L.BAR_H, L.BAR_H);
}

// ── 2. 개요 ────────────────────────────────────────────────────────
const INFO_ROW_H = 51.5;

function infoCell(s: Slide, pptx: PptxGenJS, b: Box, label: string | null, value?: string) {
  const head = label !== null;
  rect(s, pptx, b, { fill: head ? L.HEAD_FILL : "FFFFFF", line: L.TLINE });
  txt(
    s,
    head ? label! : value || "-",
    { x: b.x + 14, y: b.y, w: b.w - 28, h: b.h },
    { size: 15, bold: head, color: head ? L.HEAD_INK : L.INK, align: head ? "center" : "left", lineHeight: 20, shrink: true },
  );
}

function buildOverview(pptx: PptxGenJS, m: Manual, logo?: Img) {
  const s = blank(pptx);
  const steps = allSteps(m.pages);
  pageHead(s, pptx, logo, "매뉴얼 개요", `${displayTitle(m)} · 전체 ${steps.length}단계 · ${m.pages.length}쪽`);

  const TH_W = 150;
  const TD_W = (CONTENT_W - TH_W * 2) / 2;
  const tableY = L.BADGE_Y;
  const pairs: [string, string, string, string][] = [
    ["대상 설비", m.equipment, "설치 위치", m.location],
    ["구분", m.category, "대상 건물", m.building],
    ["작성자", m.author, "작성일", dotDate(m.date)],
  ];
  const wides: [string, string][] = [["용도 · 목적", m.purpose]];
  if (m.caution.trim()) wides.push(["주의사항", m.caution]);

  pairs.forEach(([a, va, b, vb], i) => {
    const y = tableY + i * INFO_ROW_H;
    infoCell(s, pptx, { x: L.PAD, y, w: TH_W, h: INFO_ROW_H }, a);
    infoCell(s, pptx, { x: L.PAD + TH_W, y, w: TD_W, h: INFO_ROW_H }, null, va);
    infoCell(s, pptx, { x: L.PAD + TH_W + TD_W, y, w: TH_W, h: INFO_ROW_H }, b);
    infoCell(s, pptx, { x: L.PAD + TH_W * 2 + TD_W, y, w: TD_W, h: INFO_ROW_H }, null, vb);
  });
  wides.forEach(([a, va], i) => {
    const y = tableY + (pairs.length + i) * INFO_ROW_H;
    infoCell(s, pptx, { x: L.PAD, y, w: TH_W, h: INFO_ROW_H }, a);
    infoCell(s, pptx, { x: L.PAD + TH_W, y, w: CONTENT_W - TH_W, h: INFO_ROW_H }, null, va);
  });

  const tableH = (pairs.length + wides.length) * INFO_ROW_H;
  const secY = tableY + tableH + 26;
  rect(s, pptx, { x: L.PAD, y: secY + 3.8, w: 5, h: 18 }, { fill: L.NAVY, radius: 2 });
  txt(s, "작동 순서", { x: L.PAD + 13, y: secY, w: 400, h: 25.5 }, { size: 17, bold: true, color: L.NAVY });
  txt(
    s,
    "사진 번호와 같은 순서입니다",
    { x: L.PAD + 420, y: secY + 3, w: CONTENT_W - 420, h: 19.5 },
    { size: 13, color: L.MUTED, align: "right" },
  );

  const listY = secY + 32.5;
  const listH = PAGE_BOTTOM - listY;
  if (!steps.length) {
    txt(s, "아직 등록된 단계가 없습니다.", { x: L.PAD, y: listY, w: CONTENT_W, h: 40 }, { size: 13, color: L.FAINT });
    return;
  }
  const rows = Math.max(1, Math.ceil(steps.length / 2));
  const lineH = Math.min(30, listH / (rows + 1));
  const font = lineH >= 26 ? 13 : lineH >= 21 ? 12 : lineH >= 17 ? 11 : 10;
  const colW = (CONTENT_W - 16) / 2;

  steps.forEach((st, i) => {
    const col = i < rows ? 0 : 1;
    const row = i < rows ? i : i - rows;
    const x = L.PAD + col * (colW + 16);
    const y = listY + row * lineH;
    const bw = Math.max(22, String(st.n).length * 8 + 14);
    rect(s, pptx, { x, y: y + (lineH - 18) / 2, w: bw, h: 18 }, { fill: L.NAVY, radius: 4 });
    txt(s, String(st.n), { x, y: y + (lineH - 18) / 2, w: bw, h: 18 }, { size: font - 2, bold: true, color: "FFFFFF", align: "center" });
    txt(s, st.text, { x: x + bw + 8, y, w: colW - bw - 8, h: lineH }, { size: font, shrink: true });
    rect(s, pptx, { x, y: y + lineH - 1, w: colW, h: 1 }, { fill: L.LINE });
  });
}

// ── 3. 사진 쪽 ─────────────────────────────────────────────────────
function noteBox(s: Slide, pptx: PptxGenJS, b: Box, label: string, text: string) {
  rect(s, pptx, b, { fill: "FFFFFF", line: L.LINE, radius: 8 });
  rect(s, pptx, { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: L.NOTE_HEAD_H }, { fill: L.HEAD_FILL });
  txt(s, label, { x: b.x + 13, y: b.y + 1, w: b.w - 26, h: L.NOTE_HEAD_H }, { size: 13, bold: true, color: L.HEAD_INK });
  txt(
    s,
    text.trim() || "해당 없음",
    { x: b.x + 12, y: b.y + L.NOTE_HEAD_H + 9, w: b.w - 24, h: b.h - L.NOTE_HEAD_H - 18 },
    { size: 13, color: text.trim() ? L.INK : L.FAINT, valign: "top", lineHeight: 21, shrink: true },
  );
}

function buildPhotoPage(
  pptx: PptxGenJS,
  m: Manual,
  page: ManualPage,
  start: number,
  index: number,
  total: number,
  imgs: Map<string, Img>,
  logo?: Img,
) {
  const s = blank(pptx);
  pageHead(s, pptx, logo, displayTitle(m), `${m.equipment || m.building} · ${dotDate(m.date)}`);

  const badge = page.heading.trim() || `${index + 1}쪽`;
  const badgeW = Math.max(100, badge.length * 15 + 28);
  rect(s, pptx, { x: L.PAD, y: L.BADGE_Y, w: badgeW, h: L.BADGE_H }, { fill: L.NAVY, radius: 4 });
  txt(s, badge, { x: L.PAD, y: L.BADGE_Y, w: badgeW, h: L.BADGE_H }, { size: 14, bold: true, color: "FFFFFF", align: "center" });

  const last = start + Math.max(page.steps.length, 1) - 1;
  txt(
    s,
    page.steps.length ? `${start} ~ ${last}단계` : "단계 없음",
    { x: L.PAD + badgeW + 10, y: L.BADGE_Y + 5.5, w: 300, h: 18 },
    { size: 12, color: L.FAINT },
  );
  txt(
    s,
    `${index + 1} / ${total}`,
    { x: L.PAD + CONTENT_W - 200, y: L.BADGE_Y + 5.5, w: 200, h: 18 },
    { size: 12, color: L.FAINT, align: "right" },
  );

  const g = gridBox(page.layout);
  const cap = LAYOUT_CAP[page.layout];
  for (let i = 0; i < cap; i++) {
    const p = cellXY(page.layout, i);
    const step = page.steps[i];
    // 빈 칸은 번호도 설명도 붙이지 않는다 — 단계 수와 번호가 어긋나면 안 된다
    if (!step) {
      rect(s, pptx, p, { fill: L.SLOT, line: L.LINE, radius: 6 });
      txt(s, "사진 없음", p, { size: 12, color: L.SLOT_INK, align: "center" });
      continue;
    }
    rect(s, pptx, p, { fill: "FFFFFF", line: L.LINE, radius: 6 });
    photo(s, pptx, step.url ? imgs.get(step.url) : undefined, { x: p.x + 1, y: p.y + 1, w: p.w - 2, h: g.photoH - 1 });
    rect(s, pptx, { x: p.x + 1, y: p.y + g.photoH, w: p.w - 2, h: 1 }, { fill: L.LINE });
    const capText = step.caption?.trim();
    txt(
      s,
      capText || "설명 없음",
      { x: p.x + 9, y: p.y + g.photoH + 1, w: p.w - 18, h: L.CAP_H - 2 },
      { size: 12, color: capText ? L.INK : L.FAINT, lineHeight: 16, shrink: true },
    );
    // 번호 배지 — 사진 위에 얹는다
    rect(s, pptx, { x: p.x + 7, y: p.y + 7, w: L.NUM, h: L.NUM }, { fill: L.NAVY, radius: 4 });
    txt(s, String(start + i), { x: p.x + 7, y: p.y + 7, w: L.NUM, h: L.NUM }, { size: 11, bold: true, color: "FFFFFF", align: "center" });
  }

  const label = LAYOUT_NOTE_LABEL[page.layout];
  if (g.note) noteBox(s, pptx, g.note, label, page.note);
  if (g.panel) noteBox(s, pptx, g.panel, label, page.note);
}

// ── 만들기 ─────────────────────────────────────────────────────────
export async function buildManualPptx(m: Manual): Promise<{ blob: Blob; fileName: string }> {
  const PptxGenJSClass = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJSClass();
  pptx.defineLayout({ name: "MANUAL_A4L", width: IN(L.PAGE_W), height: IN(L.PAGE_H) });
  pptx.layout = "MANUAL_A4L";

  const urls = [coverImage(m), ...m.pages.flatMap((p) => p.steps.map((s) => s.url || ""))];
  const [imgs, logo] = await Promise.all([loadAll(urls), loadImage("/samkoo.png")]);

  buildCover(pptx, m, imgs, logo ?? undefined);
  if (m.overview) buildOverview(pptx, m, logo ?? undefined);
  const starts = stepStarts(m.pages);
  m.pages.forEach((p, i) => buildPhotoPage(pptx, m, p, starts[i], i, m.pages.length, imgs, logo ?? undefined));

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  return { blob, fileName: manualFileName(m, "pptx") };
}
