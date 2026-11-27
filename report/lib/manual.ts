// 작동 매뉴얼 — 1·2사옥 보고서 PPT 양식(표지 + 네이비 머리 + 사진칸)을 그대로 쓴다.
//
// 한 페이지에 사진을 3×2(6장) 또는 2×2(4장)로 깔고, 사진마다 번호와 한 줄 설명을 붙인다.
// 번호는 페이지를 넘어가도 이어진다 — 1페이지가 1~6이면 2페이지는 7번부터.
//
//  · "3x2" — 사진 6장을 가로로 펼치고, 아래에 「주의사항 · 비고」 칸 (촬영보고서 구역 페이지와 같은 틀)
//  · "2x2" — 사진 4장을 왼쪽에 크게, 오른쪽에 「설명」 칸   (촬영보고서 특이사항 페이지와 같은 틀)
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

/** 사옥별 기본 건물명 — 표지 맨 윗줄 */
export const SITE_BUILDING: Record<Site, string> = {
  "1사옥": "바이오 이노베이션 허브",
  "2사옥": "한독 · 제넥신 · 프로젠 연구소",
};

/** 사옥별 표지 사진 (report/public) */
export const SITE_COVER: Record<Site, string> = {
  "1사옥": "/cover-building.jpg",
  "2사옥": "/cover-building2.jpg",
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
// PDF(HTML)와 PPT(pptxgenjs)가 이 값을 함께 읽는다. 한 곳만 고치면 둘 다 바뀐다.
export const LAYOUT = {
  PAGE_W: 1123,
  PAGE_H: 794,
  PAD: 28,
  NAVY: "0F2C5C",
  BLUE: "4F86D6",
  INK: "111111",
  MUTED: "64748B",
  FAINT: "94A3B8",
  LINE: "E2E8F0",
  TLINE: "CBD5E1",
  HEAD_FILL: "EEF2F7",
  HEAD_INK: "334155",
  SLOT: "F8FAFC",
  SLOT_INK: "CBD5E1",

  // 표지
  COVER_Y: 379.2, // 사진이 시작하는 높이 (위는 흰 바탕)
  BAR_H: 8,

  // 내용 쪽 머리
  TITLE_Y: 28,
  TITLE_H: 37.5,
  SUB_Y: 68.5,
  SUB_H: 18,
  LOGO: { x: 1013.1, y: 28, w: 81.9, h: 38 },
  COVER_LOGO: { x: 979.8, y: 36, w: 99.2, h: 46 },

  // 사진 쪽
  BADGE_Y: 98.5,
  BADGE_H: 29,
  GRID_Y: 139.5,
  GAP: 10,
  CAP_H: 40, // 사진 아래 설명줄 높이
  NUM: 20, // 번호 배지 한 변
  NOTE_H: 103.5, // 3x2 아래 비고칸 전체 높이
  NOTE_HEAD_H: 31.5,
  PANEL_W: 378, // 2x2 오른쪽 설명칸 너비
  PANEL_GAP: 12,
} as const;

/** 쪽 바닥 (여백 안쪽) */
export const PAGE_BOTTOM = LAYOUT.PAGE_H - LAYOUT.PAD; // 766
export const CONTENT_W = LAYOUT.PAGE_W - LAYOUT.PAD * 2; // 1067

/** 사진 격자의 칸 크기 — PDF·PPT 가 같은 값을 쓴다 */
export function gridBox(layout: ManualLayout) {
  const { PAD, GAP, GRID_Y, NOTE_H, PANEL_W, PANEL_GAP, CAP_H } = LAYOUT;
  if (layout === "2x2") {
    const w = CONTENT_W - PANEL_W - PANEL_GAP;
    const h = PAGE_BOTTOM - GRID_Y;
    const cw = (w - GAP) / 2;
    const ch = (h - GAP) / 2;
    return {
      cols: 2,
      rows: 2,
      x: PAD,
      y: GRID_Y,
      w,
      h,
      cw,
      ch,
      photoH: ch - CAP_H,
      panel: { x: PAD + w + PANEL_GAP, y: GRID_Y, w: PANEL_W, h },
      note: null as null | { x: number; y: number; w: number; h: number },
    };
  }
  const h = PAGE_BOTTOM - NOTE_H - GAP - GRID_Y;
  const cw = (CONTENT_W - GAP * 2) / 3;
  const ch = (h - GAP) / 2;
  return {
    cols: 3,
    rows: 2,
    x: PAD,
    y: GRID_Y,
    w: CONTENT_W,
    h,
    cw,
    ch,
    photoH: ch - CAP_H,
    panel: null as null | { x: number; y: number; w: number; h: number },
    note: { x: PAD, y: PAGE_BOTTOM - NOTE_H, w: CONTENT_W, h: NOTE_H },
  };
}

/** 한 칸의 왼쪽 위 좌표 */
export function cellXY(layout: ManualLayout, i: number) {
  const g = gridBox(layout);
  return {
    x: g.x + (i % g.cols) * (g.cw + LAYOUT.GAP),
    y: g.y + Math.floor(i / g.cols) * (g.ch + LAYOUT.GAP),
    w: g.cw,
    h: g.ch,
  };
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
    category: "설비 운전",
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
