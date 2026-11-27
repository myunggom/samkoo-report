// 작동 매뉴얼 — 1사옥 보고 PPT 양식을 그대로 쓴다.
//
// 양식 원본 : 「[검토] 1사옥 9층 EHP 덕트 시공상태 검토_2026.11.25.pptx」 (사장 지정, 2026-11-27)
//   · 표지   흰 바탕에 건물명·제목(네이비 58px)·대상/구분/확인일/작성, 아래 절반 야경 사진, 맨 아래 네이비 8px 띠
//   · 내용쪽 네이비 제목 + 회색 부제 + 오른쪽 삼구 로고 / 대상·확인일·구분·작성 2행 표 / 네이비 배지 / 본문
//   · 사진   둥근 회색 틀 안에 사진을 꽉 채우고, 사진 아래쪽에 검정 75% 띠 + 흰 글씨로 ① 설명
//
// 한 쪽에 사진을 3×2(6장) 또는 2×2(4장)로 깔고, 사진마다 번호와 한 줄 설명을 붙인다.
// 번호는 쪽을 넘어가도 이어진다 — 1쪽이 1~6이면 2쪽은 7번부터.
//
//  · "3x2" — 사진 6장 + 아래 「주의사항 · 비고」 칸
//  · "2x2" — 사진 4장을 왼쪽에 크게 + 오른쪽 「설명」 칸
//
// 출력은 PPT(lib/manualPptx.ts)와 PDF(components/ManualDocument.tsx) 두 가지이고,
// 두 출력이 똑같이 보이도록 좌표(px)를 이 파일의 LAYOUT 에서 함께 읽어 쓴다.

export type ManualLayout = "3x2" | "2x2";

export const LAYOUTS: ManualLayout[] = ["3x2", "2x2"];

/** 페이지당 사진 수 */
export const LAYOUT_CAP: Record<ManualLayout, number> = { "3x2": 6, "2x2": 4 };

export const LAYOUT_LABEL: Record<ManualLayout, string> = {
  "3x2": "3 × 2 (사진 6장)",
  "2x2": "2 × 2 (사진 4장 + 설명)",
};

export const LAYOUT_NOTE_LABEL: Record<ManualLayout, string> = {
  "3x2": "주의사항 · 비고",
  "2x2": "설명",
};

// ── 자료 ───────────────────────────────────────────────────────────
export type ManualStep = { url?: string; caption?: string };

export type ManualPage = {
  id: string;
  heading: string; // 페이지 제목 (예: "기동 전 점검")
  layout: ManualLayout;
  steps: ManualStep[]; // 길이는 LAYOUT_CAP 이하
  note: string; // 3x2 → 아래 비고칸 / 2x2 → 오른쪽 설명칸
};

export type Site = "1사옥" | "2사옥";
export const SITES: Site[] = ["1사옥", "2사옥"];

/** 사옥별 기본 건물명 — 표지 맨 윗줄 (양식 원본: "바이오 이노베이션 허브 · 1사옥") */
export const SITE_BUILDING: Record<Site, string> = {
  "1사옥": "바이오 이노베이션 허브 · 1사옥",
  "2사옥": "한독 · 제넥신 · 프로젠 연구소 · 2사옥",
};

/** 표지 사진 — 양식 원본에 들어 있는 야경 사진(두 사옥이 함께 찍힌 사진) */
export const SITE_COVER: Record<Site, string> = {
  "1사옥": "/cover-building-night.jpg",
  "2사옥": "/cover-building-night.jpg",
};

export type Manual = {
  id: string;
  site: Site;
  building: string; // 표지 맨 윗줄 (사옥 기본값을 고쳐 쓸 수 있다)
  title: string; // 매뉴얼 이름 (예: "냉각탑 수동 운전")
  equipment: string; // 대상 설비
  location: string; // 설치 위치
  category: string; // 구분 (예: 기계설비 운전)
  purpose: string; // 용도 · 목적
  caution: string; // 공통 주의사항 (개요 페이지)
  author: string;
  date: string; // YYYY-MM-DD
  cover: string; // 표지 사진 URL (비면 사옥 기본 사진)
  overview: boolean; // 개요 페이지를 넣을지
  pages: ManualPage[];
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_AUTHOR = "삼구INC 시설팀";

// ── 쪽 양식 좌표 (px, A4 가로 1123×794 @96dpi) ─────────────────────
// 전부 양식 원본 pptx 에서 그대로 재어 온 값이다. PDF(HTML)와 PPT(pptxgenjs)가
// 이 값을 함께 읽는다 — 한 곳만 고치면 둘 다 바뀐다.
export const LAYOUT = {
  PAGE_W: 1123,
  PAGE_H: 794,
  PAD: 28,
  NAVY: "0F2C5C",
  INK: "111111",
  SLATE: "334155", // 표지 본문 글씨 · 표 머리글
  MUTED: "64748B", // 부제
  FAINT: "94A3B8",
  LINE: "E2E8F0",
  TLINE: "CBD5E1",
  HEAD_FILL: "EEF2F7",
  HEAD_INK: "334155",
  SLOT: "F8FAFC",
  SLOT_INK: "CBD5E1",

  // 표지
  COVER_Y: 379.2, // 사진이 시작하는 높이 (위는 흰 바탕)
  BAR_Y: 785.3, // 맨 아래 네이비 띠
  BAR_H: 8,
  COVER_LOGO: { x: 979.8, y: 36, w: 99.2, h: 46 },
  COVER_X: 60,
  COVER_BLD_Y: 60.7, // 건물명
  COVER_TITLE_Y: 125.2, // 큰 제목
  COVER_LINE_Y: [211.5, 248.7, 290.7, 332.7], // 대상 / 구분 / 작성일 / 작성

  // 내용 쪽 머리
  TITLE_Y: 28,
  TITLE_H: 37.5,
  SUB_Y: 68.5,
  SUB_H: 18,
  LOGO: { x: 1013.1, y: 28, w: 81.9, h: 38 },

  // 대상·확인일·구분·작성 2행 표 (모든 내용 쪽 공통)
  INFO_Y: 98.5,
  INFO_TH_W: 92,
  INFO_ROW_H: 34.5,
  INFO_WIDE_H: 44, // 한 줄을 다 쓰는 행(용도·주의사항)

  // 네이비 배지
  BADGE_Y: 180.5,
  BADGE_H: 29,
  BADGE_GAP: 16.8, // 배지 오른쪽 설명 글씨까지

  // 본문(사진 격자)
  GRID_Y: 217.5,
  GAP_X: 18.9,
  GAP_Y: 14,
  CAP_BAR_H: 29, // 사진 위에 얹는 검정 설명 띠
  CAP_ALPHA: 0.75,
  NUM: 17, // 번호 동그라미 지름
  NOTE_H: 120, // 3x2 아래 비고칸 전체 높이
  NOTE_HEAD_H: 31.5,
  PANEL_W: 378, // 2x2 오른쪽 설명칸 너비
} as const;

/** 쪽 바닥 (여백 안쪽) */
export const PAGE_BOTTOM = LAYOUT.PAGE_H - LAYOUT.PAD; // 766
export const CONTENT_W = LAYOUT.PAGE_W - LAYOUT.PAD * 2; // 1067

/** 사진 격자의 칸 크기 — PDF·PPT 가 같은 값을 쓴다 */
export function gridBox(layout: ManualLayout) {
  const { PAD, GAP_X, GAP_Y, GRID_Y, NOTE_H, PANEL_W } = LAYOUT;
  if (layout === "2x2") {
    const w = CONTENT_W - PANEL_W - GAP_X;
    const h = PAGE_BOTTOM - GRID_Y;
    return {
      cols: 2,
      rows: 2,
      x: PAD,
      y: GRID_Y,
      w,
      h,
      cw: (w - GAP_X) / 2,
      ch: (h - GAP_Y) / 2,
      panel: { x: PAD + w + GAP_X, y: GRID_Y, w: PANEL_W, h },
      note: null as null | { x: number; y: number; w: number; h: number },
    };
  }
  const h = PAGE_BOTTOM - NOTE_H - GAP_Y - GRID_Y;
  return {
    cols: 3,
    rows: 2,
    x: PAD,
    y: GRID_Y,
    w: CONTENT_W,
    h,
    cw: (CONTENT_W - GAP_X * 2) / 3,
    ch: (h - GAP_Y) / 2,
    panel: null as null | { x: number; y: number; w: number; h: number },
    note: { x: PAD, y: PAGE_BOTTOM - NOTE_H, w: CONTENT_W, h: NOTE_H },
  };
}

/** 한 칸의 왼쪽 위 좌표 */
export function cellXY(layout: ManualLayout, i: number) {
  const g = gridBox(layout);
  return {
    x: g.x + (i % g.cols) * (g.cw + LAYOUT.GAP_X),
    y: g.y + Math.floor(i / g.cols) * (g.ch + LAYOUT.GAP_Y),
    w: g.cw,
    h: g.ch,
  };
}

/** 배지 너비 — 글자 수에 맞춰 늘어난다 (양식: "개 요" 78.7 / "현 장 사 진" 158.5) */
export function badgeWidth(text: string): number {
  return Math.max(88, text.trim().length * 20 + 48);
}

/** 글자 폭 어림 — 한글·전각은 글자 크기 그대로, 영숫자는 0.56배 */
export function textWidth(text: string, size: number, spacing = 0): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    w += (code < 0x1100 ? 0.56 : 1) * size + spacing;
  }
  return w;
}

/** 사진 설명 띠에 들어갈 폭 (칸 너비에서 테두리·여백·번호 동그라미를 뺀 값) */
export function capBoxWidth(cellW: number): number {
  return cellW - (LAYOUT.NUM + 7) - 31;
}

/**
 * 사진 설명을 한 줄로 칸 안에 넣는다. 글자를 12→9px 로 줄여 보고,
 * 그래도 넘치면 잘라서 … 를 붙인다. PPT·PDF 가 같은 결과를 쓰도록 여기서 한 번에 정한다.
 */
export function fitCaption(text: string, boxW: number): { text: string; size: number } {
  const SPACING = 0.4;
  for (const size of [12, 11, 10, 9]) {
    if (textWidth(text, size, SPACING) <= boxW) return { text, size };
  }
  let out = text;
  while (out.length > 1 && textWidth(out + "…", 9, SPACING) > boxW) out = out.slice(0, -1);
  return { text: out + "…", size: 9 };
}

/** 모든 내용 쪽 위쪽 2행 표에 들어가는 네 칸 */
export function infoPairs(m: Manual): [string, string, string, string][] {
  return [
    ["대  상", m.equipment || "-", "위  치", m.location || "-"],
    ["구  분", m.category || "-", "작  성", [m.author, dotDate(m.date)].filter(Boolean).join("   ·   ")],
  ];
}

// ── 날짜 ───────────────────────────────────────────────────────────
export function todayYmd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function dotDate(ymd: string): string {
  const [y, m, d] = (ymd || "").split("-");
  return y ? `${y}.${m}.${d}` : "";
}

// ── 만들기 · 다듬기 ────────────────────────────────────────────────
let _pid = 0;
export function newPageId(): string {
  _pid += 1;
  return `p-${Date.now().toString(36)}-${_pid.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function emptyPage(layout: ManualLayout = "3x2", heading = ""): ManualPage {
  return { id: newPageId(), heading, layout, steps: [], note: "" };
}

export function emptyManual(id: string, site: Site = "1사옥"): Manual {
  const now = new Date().toISOString();
  return {
    id,
    site,
    building: SITE_BUILDING[site],
    title: "",
    equipment: "",
    location: "",
    category: "작동 매뉴얼",
    purpose: "",
    caution: "",
    author: DEFAULT_AUTHOR,
    date: todayYmd(),
    cover: "",
    overview: true,
    pages: [emptyPage("3x2", "작동 순서")],
    createdAt: now,
    updatedAt: now,
  };
}

/** 저장된 자료가 모자라거나 넘쳐도 양식에 맞게 맞춰 돌려준다. */
export function fillManual(m: Manual): Manual {
  const site: Site = m.site === "2사옥" ? "2사옥" : "1사옥";
  const pages = (m.pages || []).map((p) => {
    const layout: ManualLayout = p.layout === "2x2" ? "2x2" : "3x2";
    return {
      id: p.id || newPageId(),
      heading: p.heading ?? "",
      layout,
      steps: (p.steps || []).slice(0, LAYOUT_CAP[layout]),
      note: p.note ?? "",
    };
  });
  return {
    ...m,
    site,
    building: m.building?.trim() || SITE_BUILDING[site],
    title: m.title ?? "",
    equipment: m.equipment ?? "",
    location: m.location ?? "",
    category: m.category ?? "",
    purpose: m.purpose ?? "",
    caution: m.caution ?? "",
    author: m.author?.trim() || DEFAULT_AUTHOR,
    date: m.date || todayYmd(),
    cover: m.cover ?? "",
    overview: m.overview !== false,
    pages: pages.length ? pages : [emptyPage("3x2", "작동 순서")],
  };
}

/** 페이지마다 「몇 번부터 시작하는지」 — 번호는 쪽을 넘어가도 이어진다. */
export function stepStarts(pages: ManualPage[]): number[] {
  const out: number[] = [];
  let n = 1;
  for (const p of pages) {
    out.push(n);
    n += p.steps.length;
  }
  return out;
}

export function totalSteps(pages: ManualPage[]): number {
  return pages.reduce((s, p) => s + p.steps.length, 0);
}

/** 모든 단계를 번호 붙은 한 줄로 — 개요 페이지의 「작동 순서」 표 */
export function allSteps(pages: ManualPage[]): { n: number; text: string }[] {
  const out: { n: number; text: string }[] = [];
  let n = 1;
  for (const p of pages) {
    for (const s of p.steps) {
      out.push({ n, text: (s.caption || "").trim() || "(설명 없음)" });
      n += 1;
    }
  }
  return out;
}

export function coverImage(m: Manual): string {
  return m.cover?.trim() || SITE_COVER[m.site];
}

/** 파일 이름: [매뉴얼] 대상설비_제목_YYYY.MM.DD.확장자 */
export function manualFileName(m: Manual, ext: "pdf" | "pptx"): string {
  const bits = [m.equipment?.trim(), m.title?.trim()].filter(Boolean).join("_");
  const body = bits || "작동 매뉴얼";
  const name = `[매뉴얼] ${body}_${dotDate(m.date)}.${ext}`;
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

/** 표지·머리에 쓰는 제목 */
export function displayTitle(m: Manual): string {
  return m.title?.trim() || m.equipment?.trim() || "작동 매뉴얼";
}
