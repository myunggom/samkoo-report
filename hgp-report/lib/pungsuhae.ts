// 풍수해 예방 점검 보고서 — 데이터 타입 및 양식 기본값
//
// 양식 출처: "[풍수해예방 점검보고] 프로젠·제넥신·셀리드 연구소" (docx, 2페이지)
//  · 1페이지: 점검표(구분/점검내용/점검결과) + 상단 정보(사업장명·점검일자·점검자)
//  · 2페이지: 사진 5구간 × 3장 + 사진별 캡션
//
// 편집 원칙: 사진 캡션의 "기본값"은 양식 문구. 화면에선 회색 placeholder로 보이고
//   사용자가 비워두면 출력 시 기본값이 그대로 나갑니다(= caption || defaultCaption).

// ── 사진 슬롯 ────────────────────────────────────────────────────
export type PungSlot = {
  url?: string; // 업로드된 사진 URL (없으면 빈 칸)
  caption?: string; // 사용자가 덮어쓴 설명 (없으면 defaultCaption 사용)
  defaultCaption?: string; // 양식 기본 설명 (placeholder + 출력 기본값)
};

// ── 사진 구간(탭) ────────────────────────────────────────────────
export type PungSection = {
  id: string;
  title: string; // 구간명 (예: "1층 풍수해 점검")
  slots: PungSlot[]; // 기본 3칸
};

// ── 점검표 항목 ──────────────────────────────────────────────────
export type PungCheckItem = {
  category: string; // 구분 (같은 값이 연속이면 세로 병합처럼 표시)
  content: string; // 점검내용
  result: string; // 점검결과 (O / △ / X)
};

// ── 보고서 ───────────────────────────────────────────────────────
export type PungReport = {
  id: string;
  date: string; // YYYY-MM-DD (점검일 = 작성일 기본)
  site: string; // 사업장명
  inspector: string; // 점검자 (기본 빈칸 — 항상 비워둠)
  checklist: PungCheckItem[];
  sections: PungSection[];
  createdAt: string;
  updatedAt: string;
};

// 오늘 날짜 YYYY-MM-DD (로컬 기준)
export function todayYmd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// "2026-08-28" → "2026. 08. 28"
export function dotDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${y}. ${m}. ${d}`;
}

// "2026-08-28" → "2026.08.28" (파일명용)
export function fileDate(ymd: string): string {
  return ymd.replace(/-/g, ".");
}

// PDF 파일명
export const PUNG_FILE_PREFIX = "[풍수해예방 점검보고] 한독 · 제넥신 · 프로젠 연구소";
export function pungFileName(report: Pick<PungReport, "date">): string {
  return `${PUNG_FILE_PREFIX}_${fileDate(report.date)}.pdf`;
}

// 점검결과 범례
export const RESULT_LEGEND = "※ ○ : 이상 없음 / △ : 양호 / X : 점검 요함";

// ── 양식 기본 점검표 ─────────────────────────────────────────────
export function defaultChecklist(): PungCheckItem[] {
  return [
    { category: "침수/누수", content: "트랜치 이물질 제거 막힘 상태 확인 (지하1층 스피드셔터)", result: "O" },
    { category: "침수/누수", content: "배수관, 배수로 막힘 및 파손상태 확인 (옥상, 발코니 A/B core, 중정)", result: "O" },
    { category: "옥외시설", content: "옥상 피뢰기, 안테나 등 고정상태 확인 (옥상)", result: "O" },
    { category: "전기시설", content: "정전 대비 발전기 정상상태 유지 (지하3층 발전기실)", result: "O" },
    { category: "전기시설", content: "외곽 분전함 차단기 전원 차단 상태 확인 (옥탑) : 태풍발생시", result: "O" },
    { category: "전기시설", content: "1층 중정 조명등 관련 전원 차단 상태 확인 (방재실) : 태풍발생시", result: "O" },
    { category: "전기시설", content: "태양광 인버터 전원 차단 상태 확인 (지하3층 수변전실) : 태풍발생시", result: "O" },
    { category: "기계시설", content: "배수펌프 정상 운전 점검 (지하3층 DA실, 휀룸실)", result: "O" },
    { category: "기계시설", content: "수위조절 및 경보장치 정상 작동 점검 (지하3층 기계실, 우수조실)", result: "O" },
    { category: "기계시설", content: "우수조 거름망 이물질 퇴적 상태 점검 (지하2층 우수조실)", result: "O" },
    { category: "건축시설", content: "옥상 EPS, TPS, PS 방화문 시건상태 확인 (옥상)", result: "O" },
    { category: "건축시설", content: "차수판 상태 확인 및 인접장소 비치, 차량진입로 1개소 (지하1층 휀룸실)", result: "O" },
    { category: "건축시설", content: "차량 주출입구 스피드게이트 작동상태 점검 (지하1층 차량 출입구)", result: "O" },
  ];
}

// ── 양식 기본 사진 구간(5개 × 3칸) ───────────────────────────────
let _sid = 0;
function slot(defaultCaption: string): PungSlot {
  return { url: "", caption: "", defaultCaption };
}
function section(title: string, captions: string[]): PungSection {
  _sid += 1;
  return { id: `sec-${Date.now().toString(36)}-${_sid}`, title, slots: captions.map(slot) };
}

export function defaultSections(): PungSection[] {
  return [
    section("1층 풍수해 점검", ["주차장 입구 트렌치 점검", "스피드셔터 앞 트렌치 점검", "차수판 점검"]),
    section("옥탑층 풍수해 점검", ["피뢰침 고정상태 확인", "옥탑 배수로 점검", "옥탑 트렌치 점검"]),
    section("전기시설", ["발전기 AUTO 상태 확인 및 점검", "발전기 경유량 확인 (988L)", "UPS 상태 점검"]),
    section("기계설비", ["수위조절 및 경보장치 점검", "배수펌프 정상운전 점검", "우수조 청소"]),
    section("층별 발코니", ["층별 발코니 트렌치 점검", "트렌치 청소 작업", "층별 발코니 배수로 점검"]),
  ];
}

// 새 보고서 기본값 — 점검자는 항상 빈칸
export function emptyPungReport(id: string): PungReport {
  const now = new Date().toISOString();
  return {
    id,
    date: todayYmd(),
    site: "한독 · 제넥신 · 프로젠 연구소",
    inspector: "",
    checklist: defaultChecklist(),
    sections: defaultSections(),
    createdAt: now,
    updatedAt: now,
  };
}

// 캡션 출력값: 사용자 입력이 있으면 그 값, 없으면 양식 기본값
export function effectiveCaption(s: PungSlot): string {
  return (s.caption && s.caption.trim()) || s.defaultCaption || "";
}
