"use client";

// 작동 매뉴얼 → PPT(.pptx). 브라우저에서 pptxgenjs 로 만든다.
//
// 좌표·색은 lib/manual.ts 의 LAYOUT 을 PDF(components/ManualDocument.tsx)와 함께 읽는다.
// 그래서 PPT 와 PDF 가 같은 모양으로 나온다. 양식을 고칠 때는 LAYOUT 한 곳만 고치면 된다.
// 양식 원본은 lib/manual.ts 머리글 참고.
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
  badgeWidth,
  capBoxWidth,
  cellXY,
  fitCaption,
  coverImage,
  displayTitle,
  dotDate,
  gridBox,
  infoPairs,
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
type ShapeOpt = { fill?: string; alpha?: number; line?: string; lineW?: number; radius?: number; ellipse?: boolean };

function rect(slide: Slide, pptx: PptxGenJS, b: Box, o: ShapeOpt = {}) {
  const kind = o.ellipse ? pptx.ShapeType.ellipse : o.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
  slide.addShape(kind, {
    x: IN(b.x),
    y: IN(b.y),
    w: IN(b.w),
    h: IN(b.h),
    fill: o.fill ? { color: o.fill, ...(o.alpha != null ? { transparency: Math.round((1 - o.alpha) * 100) } : {}) } : { type: "none" },
    line: o.line ? { color: o.line, width: o.lineW ?? 0.75 } : { type: "none" },
    ...(o.radius && !o.ellipse ? { rectRadius: IN(o.radius) } : {}),
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
  wrap?: boolean;
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
    ...(o.wrap === false ? { wrap: false } : {}),
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

function logoAt(slide: Slide, logo: Img | undefined, box: { x: number; y: number; w: number; h: number }) {
  if (!logo) return;
  slide.addImage({
    data: logo.data,
    x: IN(box.x),
    y: IN(box.y),
    w: logo.w,
    h: logo.h,
    sizing: { type: "contain", w: IN(box.w), h: IN(box.h) },
  });
}

function pageHead(slide: Slide, pptx: PptxGenJS, logo: Img | undefined, title: string, subtitle: string) {
  txt(slide, title, { x: L.PAD, y: L.TITLE_Y, w: 700, h: L.TITLE_H }, { size: 25, bold: true, color: L.NAVY, spacing: 0.5, shrink: true });
  txt(slide, subtitle, { x: L.PAD, y: L.SUB_Y, w: 900, h: L.SUB_H }, { size: 12, color: L.MUTED, shrink: true });
  logoAt(slide, logo, L.LOGO);
}

// 표 한 칸
function cell(s: Slide, pptx: PptxGenJS, b: Box, head: boolean, text: string, size = 12) {
  rect(s, pptx, b, { fill: head ? L.HEAD_FILL : "FFFFFF", line: L.TLINE });
  txt(
    s,
    text,
    head ? b : { x: b.x + 14, y: b.y, w: b.w - 28, h: b.h },
    {
      size,
      bold: head,
      color: head ? L.HEAD_INK : L.INK,
      align: head ? "center" : "left",
      spacing: head ? 1 : 0,
      lineHeight: 17,
      shrink: true,
    },
  );
}

// 대상 / 위치 / 구분 / 작성 2행 표
function infoTable(s: Slide, pptx: PptxGenJS, m: Manual, y: number) {
  const TH = L.INFO_TH_W;
  const TD = (CONTENT_W - TH * 2) / 2;
  const H = L.INFO_ROW_H;
  infoPairs(m).forEach(([a, va, b, vb], i) => {
    const ry = y + i * H;
    cell(s, pptx, { x: L.PAD, y: ry, w: TH, h: H }, true, a);
    cell(s, pptx, { x: L.PAD + TH, y: ry, w: TD, h: H }, false, va);
    cell(s, pptx, { x: L.PAD + TH + TD, y: ry, w: TH, h: H }, true, b);
    cell(s, pptx, { x: L.PAD + TH * 2 + TD, y: ry, w: TD, h: H }, false, vb);
  });
}

// 네이비 배지 + 오른쪽 회색 글씨
function badge(s: Slide, pptx: PptxGenJS, y: number, text: string, hint?: string, right?: string) {
  const w = badgeWidth(text);
  const box = { x: L.PAD, y, w, h: L.BADGE_H };
  rect(s, pptx, box, { fill: L.NAVY, radius: 4 });
  txt(s, text, box, { size: 14, bold: true, color: "FFFFFF", align: "center", spacing: 2 });
  if (hint) txt(s, hint, { x: L.PAD + w + L.BADGE_GAP, y, w: 700, h: L.BADGE_H }, { size: 12, color: L.MUTED });
  if (right) txt(s, right, { x: L.PAD + CONTENT_W - 200, y, w: 200, h: L.BADGE_H }, { size: 12, color: L.FAINT, align: "right" });
}

function noteBox(s: Slide, pptx: PptxGenJS, b: Box, label: string, text: string) {
  rect(s, pptx, b, { fill: "FFFFFF", line: L.LINE, radius: 8 });
  rect(s, pptx, { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: L.NOTE_HEAD_H }, { fill: L.HEAD_FILL });
  txt(s, label, { x: b.x + 14, y: b.y + 1, w: b.w - 28, h: L.NOTE_HEAD_H }, { size: 13, bold: true, color: L.HEAD_INK });
  txt(
    s,
    text.trim() || "해당 없음",
    { x: b.x + 13, y: b.y + L.NOTE_HEAD_H + 9, w: b.w - 26, h: b.h - L.NOTE_HEAD_H - 18 },
    { size: 12, color: text.trim() ? L.INK : L.FAINT, valign: "top", lineHeight: 20, shrink: true },
  );
}

function blank(pptx: PptxGenJS): Slide {
  const s = pptx.addSlide();
  s.background = { color: "FFFFFF" };
  return s;
}

// ── 1. 표지 ────────────────────────────────────────────────────────
function buildCover(pptx: PptxGenJS, m: Manual, imgs: Map<string, Img>, logo?: Img) {
  const s = blank(pptx);
  photo(s, pptx, imgs.get(coverImage(m)), { x: 0, y: L.COVER_Y, w: L.PAGE_W, h: L.PAGE_H - L.COVER_Y });
  logoAt(s, logo, L.COVER_LOGO);

  txt(s, m.building, { x: L.COVER_X, y: L.COVER_BLD_Y, w: 700, h: 24 }, { size: 16, bold: true, color: L.NAVY, spacing: 3 });
  txt(s, displayTitle(m), { x: L.COVER_X, y: L.COVER_TITLE_Y, w: 960, h: 63.8 }, { size: 58, bold: true, color: L.NAVY, shrink: true, wrap: false });

  const lines: [string, string][] = [
    ["대상", [m.equipment, m.location].filter(Boolean).join(" · ") || "-"],
    ["구분", m.category || "-"],
    ["작성일", dotDate(m.date)],
    ["작성", m.author || "-"],
  ];
  lines.forEach(([k, v], i) => {
    txt(s, `${k} : ${v}`, { x: L.COVER_X, y: L.COVER_LINE_Y[i], w: 960, h: 28.8 }, { size: 16, color: L.SLATE, shrink: true });
  });

  rect(s, pptx, { x: 0, y: L.BAR_Y, w: L.PAGE_W, h: L.BAR_H }, { fill: L.NAVY });
}

// ── 2. 개요 ────────────────────────────────────────────────────────
function buildOverview(pptx: PptxGenJS, m: Manual, logo?: Img) {
  const s = blank(pptx);
  const steps = allSteps(m.pages);
  pageHead(s, pptx, logo, "매뉴얼 개요", `${displayTitle(m)} · 전체 ${steps.length}단계 · ${m.pages.length}쪽`);
  infoTable(s, pptx, m, L.INFO_Y);

  const TH = L.INFO_TH_W;
  const pairH = L.INFO_ROW_H * 2;
  const wide: [string, string][] = [["용 도 · 목 적", m.purpose || "-"]];
  if (m.caution.trim()) wide.push(["주 의 사 항", m.caution]);
  wide.forEach(([k, v], i) => {
    const y = L.INFO_Y + pairH + i * L.INFO_WIDE_H;
    cell(s, pptx, { x: L.PAD, y, w: TH, h: L.INFO_WIDE_H }, true, k);
    cell(s, pptx, { x: L.PAD + TH, y, w: CONTENT_W - TH, h: L.INFO_WIDE_H }, false, v);
  });

  const tableH = pairH + wide.length * L.INFO_WIDE_H;
  const badgeY = L.INFO_Y + tableH + 14;
  badge(s, pptx, badgeY, "작동 순서", "사진에 붙은 번호와 같은 순서입니다");

  const listY = badgeY + L.BADGE_H + 14;
  const listH = PAGE_BOTTOM - listY;
  if (!steps.length) {
    txt(s, "아직 등록된 단계가 없습니다.", { x: L.PAD, y: listY, w: CONTENT_W, h: 40 }, { size: 13, color: L.FAINT });
    return;
  }
  const rows = Math.max(1, Math.ceil(steps.length / 2));
  const lineH = Math.min(30, listH / (rows + 0.2));
  const font = lineH >= 26 ? 13 : lineH >= 21 ? 12 : lineH >= 17 ? 11 : 10;
  const colW = (CONTENT_W - 20) / 2;

  steps.forEach((st, i) => {
    const col = i < rows ? 0 : 1;
    const row = i < rows ? i : i - rows;
    const x = L.PAD + col * (colW + 20);
    const y = listY + row * lineH;
    const bw = Math.max(22, String(st.n).length * 8 + 14);
    rect(s, pptx, { x, y: y + (lineH - 18) / 2, w: bw, h: 18 }, { fill: L.NAVY, radius: 4 });
    txt(s, String(st.n), { x, y: y + (lineH - 18) / 2, w: bw, h: 18 }, { size: font - 2, bold: true, color: "FFFFFF", align: "center" });
    txt(s, st.text, { x: x + bw + 9, y, w: colW - bw - 9, h: lineH }, { size: font, shrink: true, wrap: false });
    rect(s, pptx, { x, y: y + lineH - 1, w: colW, h: 1 }, { fill: L.LINE });
  });
}

// ── 3. 사진 쪽 ─────────────────────────────────────────────────────
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
  pageHead(s, pptx, logo, displayTitle(m), m.purpose?.trim() || m.building);
  infoTable(s, pptx, m, L.INFO_Y);

  const last = start + Math.max(page.steps.length, 1) - 1;
  badge(
    s,
    pptx,
    L.BADGE_Y,
    page.heading.trim() || `${index + 1}쪽`,
    page.steps.length ? `${start} ~ ${last}단계` : "단계 없음",
    `${index + 1} / ${total}`,
  );

  const cap = LAYOUT_CAP[page.layout];
  for (let i = 0; i < cap; i++) {
    const p = cellXY(page.layout, i);
    const step = page.steps[i];
    rect(s, pptx, p, { fill: L.SLOT, line: L.LINE, radius: 6 });
    // 빈 칸은 번호도 설명도 붙이지 않는다 — 단계 수와 번호가 어긋나면 안 된다
    if (!step) {
      txt(s, "사진 없음", p, { size: 12, color: L.SLOT_INK, align: "center" });
      continue;
    }
    photo(s, pptx, step.url ? imgs.get(step.url) : undefined, { x: p.x + 1, y: p.y + 1, w: p.w - 2, h: p.h - 2 });

    // 사진 아래쪽 검정 띠 + ① 설명
    const barY = p.y + p.h - 1 - L.CAP_BAR_H;
    rect(s, pptx, { x: p.x + 1, y: barY, w: p.w - 2, h: L.CAP_BAR_H }, { fill: "000000", alpha: L.CAP_ALPHA });
    const numBox = { x: p.x + 12, y: barY + (L.CAP_BAR_H - L.NUM) / 2, w: L.NUM, h: L.NUM };
    rect(s, pptx, numBox, { ellipse: true, line: "FFFFFF", lineW: 0.75 });
    txt(s, String(start + i), numBox, { size: 10, bold: true, color: "FFFFFF", align: "center" });
    const capW = capBoxWidth(p.w);
    const cap = fitCaption(step.caption?.trim() || "설명 없음", capW);
    txt(
      s,
      cap.text,
      { x: numBox.x + L.NUM + 7, y: barY, w: capW, h: L.CAP_BAR_H },
      { size: cap.size, bold: true, color: "FFFFFF", spacing: 0.4, wrap: false },
    );
  }

  const g = gridBox(page.layout);
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
