// 일반 보고서(사고·완료·점검·보수요청) 데이터 타입 및 양식 기본값
//
// 문서 양식은 사장 결재 양식(구매검토서)과 동일: 네이비 제목 머리 + 작성일/작성/대상 건물/구분
// 메타표 + 번호 붙은 섹션 바 + 첨부사진. 두 가지 레이아웃:
//  · "common"  — 완료/점검/보수요청: (소제목+본문) 섹션 여러 개 + 첨부사진
//  · "accident"— 사고보고서: 사고 개요·피해 현황 표 + 조치·향후방안 + 첨부사진
//
// PDF 파일명·제목은 원본 문서 명명규칙을 따름: [브래킷] 대상_제목_YYYY.MM.DD

export type ReportPhoto = { url?: string; caption?: string };

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

// 양식 머리에 들어가는 고정값 (바이오 이노베이션 허브 전용 앱)
export const DEFAULT_BUILDING = "바이오 이노베이션 허브";
export const DEFAULT_AUTHOR = "삼구INC 이명진 시설팀장";

// 종류별 "구분" 기본값 — 문서 성격을 한 줄로
export const KIND_CATEGORY: Record<ReportKind, string> = {
  accident: "사고 발생 보고",
  completion: "작업 완료 보고",
  inspection: "설비 점검 보고",
  repair: "보수 조치 요청",
  review: "검토 및 의견 보고",
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

// 사고보고서 항목
export type AccidentFields = {
  reporter: string; // 보고자
  title: string; // 제목(사고 개요)
  occurredAt: string; // 발생 일시
  place: string; // 발생 장소
  cause: string; // 발생 원인
  scope: string; // 피해 범위
  humanDamage: string; // 인적 피해
  propertyDamage: string; // 물적 피해
  damageCost: string; // 피해액
  actions: string; // 조치 사항 및 경과
  followup: string; // 대응 적합성 및 향후 방안
};

export type GenReport = {
  id: string;
  kind: ReportKind;
  bracket: string; // 제목 앞 [] 안 내용 (직접 입력)
  site: string; // 대상/사업장
  subject: string; // 제목 요약 (파일명용)
  docTitle: string; // 문서 상단 큰 제목 (네이비 머리)
  subtitle: string; // 큰 제목 아래 한 줄 설명
  building: string; // 메타표 "대상 건물"
  category: string; // 메타표 "구분"
  author: string; // 메타표 "작성" (사고 양식은 "보고자")
  date: string; // YYYY-MM-DD
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

// 예전에 저장된 보고서에는 양식 칸(부제·대상 건물·구분·작성)이 없다.
// 읽을 때 기본값으로 채워, 옛 보고서도 새 양식으로 그대로 출력되게 한다.
export function fillDefaults(r: GenReport): GenReport {
  return {
    ...r,
    subtitle: r.subtitle ?? "",
    building: r.building?.trim() || DEFAULT_BUILDING,
    category: r.category?.trim() || KIND_CATEGORY[r.kind] || "",
    author: r.author?.trim() || r.accident?.reporter?.trim() || DEFAULT_AUTHOR,
    // 표는 나중에 생긴 기능이다. 옛 보고서에는 없으므로 빈 칸으로 채워 둔다.
    sections: (r.sections || []).map((s) => ({ ...s, tables: (s.tables || []).map(normalizeTable) })),
    tables: (r.tables || []).map(normalizeTable),
  };
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

function emptyAccident(): AccidentFields {
  return {
    reporter: "",
    title: "",
    occurredAt: "",
    place: "",
    cause: "",
    scope: "",
    humanDamage: "",
    propertyDamage: "",
    damageCost: "",
    actions: "",
    followup: "",
  };
}

export function emptyGenReport(id: string, kind: ReportKind): GenReport {
  const now = new Date().toISOString();
  return {
    id,
    kind,
    bracket: KIND_LABEL[kind],
    site: "프로젠·제넥신·셀리드",
    subject: "",
    docTitle: "",
    subtitle: "",
    building: DEFAULT_BUILDING,
    category: KIND_CATEGORY[kind],
    author: DEFAULT_AUTHOR,
    date: todayYmd(),
    sections: defaultSections(kind),
    accident: emptyAccident(),
    tables: [],
    photos: [],
    createdAt: now,
    updatedAt: now,
  };
}
