// 아카이브(사진·동영상 보관) + 일일 기록 데이터 타입
//
// 설계: 아카이브(MediaItem)가 모든 사진·동영상의 원본 저장소.
//   일일 기록은 같은 미디어를 "날짜"로 묶어 보여주고, 날짜별 메모(DayNote)를 곁들임.
//   → 데이터 중복 없음. 아카이브에서 지우면 일지에서도 사라짐.

export type MediaType = "image" | "video";

export type MediaItem = {
  id: string;
  url: string; // Blob 원본 URL (사진 또는 동영상)
  type: MediaType;
  category: string; // MEDIA_CATEGORIES 중 하나
  title?: string; // 짧은 설명/제목
  note?: string; // 상세 메모
  area?: string; // 위치(구역) — 예: 지하3층 기계실
  takenAt: string; // YYYY-MM-DD (촬영/기록 날짜, 기본 오늘)
  uploader?: string; // 올린 사람 (자유 입력)
  createdAt: string;
};

// 날짜별 메모 (그날 건물에 있었던 일)
export type DayNote = {
  date: string; // YYYY-MM-DD (키)
  note: string;
  updatedAt: string;
};

// 카테고리 (사장 지정)
export const MEDIA_CATEGORIES = [
  "사고",
  "작업 전/중/후",
  "시설·안전 점검",
  "일상 기록·기타",
] as const;

export const DEFAULT_CATEGORY = "일상 기록·기타";

// 카테고리별 배지 색상 (Tailwind 클래스)
export const CATEGORY_STYLE: Record<string, string> = {
  "사고": "bg-red-100 text-red-700 border-red-200",
  "작업 전/중/후": "bg-amber-100 text-amber-700 border-amber-200",
  "시설·안전 점검": "bg-sky-100 text-sky-700 border-sky-200",
  "일상 기록·기타": "bg-slate-100 text-slate-600 border-slate-200",
};

export function categoryStyle(cat: string): string {
  return CATEGORY_STYLE[cat] || CATEGORY_STYLE["일상 기록·기타"];
}

// 오늘 날짜 YYYY-MM-DD
export function todayYmd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "2026-08-28" → "2026. 08. 28 (금)"
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
export function prettyDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}. ${p(m)}. ${p(d)} (${WEEK[dt.getDay()]})`;
}

// 파일 → 이미지/동영상 판별
export function mediaTypeOf(file: { type: string }): MediaType {
  return file.type.startsWith("video") ? "video" : "image";
}
