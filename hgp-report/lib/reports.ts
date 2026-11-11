// 일반 보고서(사고·완료·점검·보수요청) 데이터 타입 및 양식 기본값
//
// 두 가지 레이아웃:
//  · "common"  — 완료/점검/보수요청 공통: 큰 제목 + 날짜 + 삼구INC + (소제목+본문) 섹션 여러 개 + 첨부사진
//  · "accident"— 사고보고서: 키-값 표(보고자/개요/피해현황/조치/향후방안) + 첨부사진
//
// PDF 파일명·제목은 원본 문서 명명규칙을 따름: [브래킷] 대상_제목_YYYY.MM.DD

export type ReportPhoto = { url?: string; caption?: string; note?: string }; // caption=사진 제목, note=부가 설명

export type ReportKind = "accident" | "completion" | "inspection" | "repair" | "review";
export type ReportLayout = "accident" | "common";

export const REPORT_KINDS: ReportKind[] = ["accident", "completion", "inspection", "repair", "review"];

export const KIND_LABEL: Record<ReportKind, string> = {
  accident: "사고보고서",
  completion: "완료보고서",
  inspection: "점검보고서",
  repair: "보수요청서",
  review: "검토보고서",
};

export const KIND_LAYOUT: Record<ReportKind, ReportLayout> = {
  accident: "accident",
  completion: "common",
  inspection: "common",
  repair: "common",
  review: "common",
};

export const KIND_EMOJI: Record<ReportKind, string> = {
  accident: "🚨",
  completion: "✅",
  inspection: "🔍",
  repair: "🛠",
  review: "📝",
};

// ── 표 ────────────────────────────────────────────────────────────
// 보고서 안에 직접 그려 넣는 표. 행·열을 자유롭게 늘리고 줄일 수 있다.
// 워드로 낼 때는 lib/docxTable.ts 가 이 값을 양식과 같은 모양의 표로 바꾼다.
export type ReportTable = {
  id: string;
  caption: string; // 표 위에 붙는 이름 (비워도 됨)
  header: boolean; // 첫 줄을 머리글(연청색 칸)로 쓸지
  widths: number[]; // 열 너비 비율. 길이는 열 개수와 같다.
  rows: string[][]; // [행][열] 글자. 모든 행의 길이는 widths.length 와 같다.
};

export const TABLE_MAX_COLS = 8;
export const TABLE_MAX_ROWS = 40;

export function emptyTable(cols = 3, rows = 3): ReportTable {
  const c = Math.max(1, Math.min(TABLE_MAX_COLS, cols));
  const r = Math.max(1, Math.min(TABLE_MAX_ROWS, rows));
  return {
    id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    caption: "",
    header: true,
    widths: Array.from({ length: c }, () => 1),
    rows: Array.from({ length: r }, () => Array.from({ length: c }, () => "")),
  };
}

/** 저장된 표가 찌그러져 있어도(행마다 칸 수가 다름) 네모나게 맞춰 돌려준다. */
export function normalizeTable(t: ReportTable): ReportTable {
  const cols = Math.max(1, Math.min(TABLE_MAX_COLS, t.widths?.length || t.rows?.[0]?.length || 1));
  const widths = Array.from({ length: cols }, (_, i) => (t.widths?.[i] && t.widths[i] > 0 ? t.widths[i] : 1));
  const rows = (t.rows || []).slice(0, TABLE_MAX_ROWS).map((r) =>
    Array.from({ length: cols }, (_, i) => (r?.[i] ?? "")),
  );
  return { ...t, widths, rows: rows.length ? rows : [Array.from({ length: cols }, () => "")] };
}

/** 글자가 하나도 없는 표는 문서에 넣지 않는다. */
export function tableHasContent(t: ReportTable): boolean {
  return (t.rows || []).some((r) => r.some((c) => (c || "").trim() !== ""));
}

// 공통 양식: 소제목+본문 섹션 (+ 표는 몇 개든 붙일 수 있다)
export type ReportTextSection = { id: string; heading: string; body: string; tables?: ReportTable[] };

// 사고보고서 항목 (원본 양식: [사고보고서] 한독·제넥신·프로젠_양식.docx)
export type TimelineRow = { time: string; kind: string; content: string; actor: string }; // 조치 경과
export type PlanRow = { text: string; result: string }; // 조치 계획·재발 방지 (결과: 진행중/예정/검토/완료)

export type AccidentFields = {
  reporter: string; // (구버전) 보고자 — 현재는 GenReport.reporter 사용
  grade: string; // 사고 등급 (예: 경미 (Level 1))
  gradeNote: string; // 등급 옆 설명 (예: 인적·물적 피해 없음)
  title: string; // 사고 제목
  occurredAt: string; // 발생 일시
  place: string; // 발생 장소
  cause: string; // 발생 원인
  scope: string; // 영향 범위
  reportPath: string; // 신고 경로
  sumTime: string; // 핵심 요약: 발생 일시(짧게) — 비우면 발생 일시
  sumPlace: string; // 핵심 요약: 발생 장소(짧게) — 비우면 발생 장소
  sumDamage: string; // 핵심 요약: 피해 규모
  sumTemp: string; // 핵심 요약: 임시조치 완료 (예: 09:30 (54분))
  humanDamage: string; // 인적 피해
  propertyDamage: string; // 물적 피해
  damageCost: string; // 피해 금액
  damageNote: string; // 피해 현황 비고(※)
  timeline: TimelineRow[]; // 조치 사항 및 경과
  plans: PlanRow[]; // 조치 및 계획
  prevents: PlanRow[]; // 재발 방지 대책
  actions?: string; // (구버전) 조치 사항 텍스트
  followup?: string; // (구버전) 향후 방안 텍스트
};

export const ACCIDENT_GRADES = ["경미 (Level 1)", "보통 (Level 2)", "중대 (Level 3)"];
export const PLAN_RESULTS = ["진행중", "예정", "검토", "완료"];

export type GenReport = {
  id: string;
  kind: ReportKind;
  bracket: string; // 제목 앞 [] 안 내용 (직접 입력)
  site: string; // 대상/사업장
  subject: string; // 제목 요약 (파일명용)
  docTitle: string; // 제목 (공통 양식: "제목 : …" 줄)
  date: string; // YYYY-MM-DD (보고일)
  reporter: string; // 보고자
  reportTo: string; // 보고 대상
  place: string; // 공통 양식: 작업/점검/요청 장소
  summary: string; // 한 줄 요약
  signoff: string; // 문서 끝 발신 (관리사무소명)
  sections: ReportTextSection[]; // 공통 양식 본문
  accident: AccidentFields; // 사고 양식 항목
  tables?: ReportTable[]; // 사고 양식에서 쓰는 표 (첨부사진 바로 앞에 들어간다)
  photos: ReportPhoto[]; // 첨부사진
  createdAt: string;
  updatedAt: string;
};

export function layoutOf(kind: ReportKind): ReportLayout {
  return KIND_LAYOUT[kind];
}

// 날짜 helpers
export function todayYmd(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function dotDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${y}.${m}.${d}`;
}
export function fileDate(ymd: string): string {
  return ymd.replace(/-/g, ".");
}

// PDF 파일명: [브래킷] 대상_제목_YYYY.MM.DD.pdf
export function reportFileName(r: Pick<GenReport, "bracket" | "site" | "subject" | "date">): string {
  const subj = r.subject?.trim() ? `_${r.subject.trim()}` : "";
  const site = r.site?.trim() ? ` ${r.site.trim()}` : "";
  return `[${r.bracket || "보고서"}]${site}${subj}_${fileDate(r.date)}.pdf`;
}

let _sid = 0;
function sec(heading: string, body = "", tables: ReportTable[] = []): ReportTextSection {
  _sid += 1;
  return { id: `s-${Date.now().toString(36)}-${_sid}`, heading, body, tables };
}

/** 검토보고서의 "비교 검토"에 미리 깔아 두는 빈 비교표 */
function compareTable(): ReportTable {
  const t = emptyTable(4, 4);
  t.rows[0] = ["구분", "A 안", "B 안", "비고"];
  return t;
}

function defaultSections(kind: ReportKind): ReportTextSection[] {
  switch (kind) {
    case "inspection":
      return [sec("점검 배경"), sec("점검 방법"), sec("점검 결과")];
    case "repair":
      return [sec("요청 배경"), sec("조치 방법"), sec("요청 사항")];
    case "completion":
      return [sec("배경"), sec("조치 내용"), sec("특이사항")];
    case "review":
      // 사장 결재 양식의 바탕이 된 구매검토서와 같은 흐름
      return [sec("검토 배경"), sec("검토 내용"), sec("비교 검토", "", [compareTable()]), sec("검토 결과 및 요청사항")];
    default:
      return [sec("내용")];
  }
}

// 문서 상단 네이비 제목바 글자 (자간 띄움)
export const KIND_BANNER: Record<ReportKind, string> = {
  accident: "사 고 보 고 서",
  completion: "완 료 보 고 서",
  inspection: "점 검 보 고 서",
  repair: "보 수 요 청 서",
  review: "검 토 보 고 서",
};

// 공통 양식 정보표 4번째 칸 라벨
export const KIND_PLACE_LABEL: Record<ReportKind, string> = {
  accident: "발생 장소",
  completion: "작업 장소",
  inspection: "점검 장소",
  repair: "요청 위치",
  review: "검토 대상",
};

export const DEFAULT_SITE = "한독 · 제넥신 · 프로젠 연구소";
export const DEFAULT_SIGNOFF = "한독 및 제넥신&프로젠 관리사무소";

function emptyAccident(): AccidentFields {
  return {
    reporter: "",
    grade: ACCIDENT_GRADES[0],
    gradeNote: "",
    title: "",
    occurredAt: "",
    place: "",
    cause: "",
    scope: "",
    reportPath: "",
    sumTime: "",
    sumPlace: "",
    sumDamage: "없음",
    sumTemp: "",
    humanDamage: "없 음",
    propertyDamage: "없 음",
    damageCost: "없 음",
    damageNote: "",
    timeline: [{ time: "", kind: "접수", content: "", actor: "" }],
    plans: [{ text: "", result: "진행중" }],
    prevents: [{ text: "", result: "예정" }],
  };
}

export function emptyGenReport(id: string, kind: ReportKind): GenReport {
  const now = new Date().toISOString();
  return {
    id,
    kind,
    bracket: KIND_LABEL[kind],
    site: DEFAULT_SITE,
    subject: "",
    docTitle: "",
    date: todayYmd(),
    reporter: "",
    reportTo: "관리소장",
    place: "",
    summary: "",
    signoff: DEFAULT_SIGNOFF,
    sections: defaultSections(kind),
    accident: emptyAccident(),
    tables: [],
    photos: [],
    createdAt: now,
    updatedAt: now,
  };
}

// 구버전·일부 필드만 있는 보고서를 현재 형식으로 채움 (저장된 옛 데이터 호환)
export function normalizeGenReport(r: GenReport): GenReport {
  const base = emptyGenReport(r.id, r.kind);
  const a = { ...base.accident, ...(r.accident || {}) } as AccidentFields;
  // 구버전 텍스트 → 새 표 형식
  if ((!r.accident?.timeline || r.accident.timeline.length === 0) && a.actions?.trim()) {
    a.timeline = a.actions
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => ({ time: "", kind: "", content: l, actor: "" }));
  }
  if ((!r.accident?.prevents || r.accident.prevents.length === 0) && a.followup?.trim()) {
    a.prevents = a.followup
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => ({ text: l, result: "" }));
  }
  return {
    ...base,
    ...r,
    reporter: r.reporter ?? a.reporter ?? "",
    reportTo: r.reportTo ?? base.reportTo,
    place: r.place ?? "",
    summary: r.summary ?? "",
    signoff: r.signoff ?? base.signoff,
    // 표는 나중에 생긴 기능이다. 옛 보고서에는 없으므로 빈 칸으로 채워 둔다.
    sections: (r.sections ?? base.sections).map((x) => ({ ...x, tables: (x.tables || []).map(normalizeTable) })),
    tables: (r.tables || []).map(normalizeTable),
    photos: r.photos ?? [],
    accident: a,
  };
}
