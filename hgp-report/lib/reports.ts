// 일반 보고서(사고·완료·점검·보수요청) 데이터 타입 및 양식 기본값
//
// 두 가지 레이아웃:
//  · "common"  — 완료/점검/보수요청 공통: 큰 제목 + 날짜 + 삼구INC + (소제목+본문) 섹션 여러 개 + 첨부사진
//  · "accident"— 사고보고서: 키-값 표(보고자/개요/피해현황/조치/향후방안) + 첨부사진
//
// PDF 파일명·제목은 원본 문서 명명규칙을 따름: [브래킷] 대상_제목_YYYY.MM.DD

export type ReportPhoto = { url?: string; caption?: string; note?: string }; // caption=사진 제목, note=부가 설명

export type ReportKind = "accident" | "completion" | "inspection" | "repair";
export type ReportLayout = "accident" | "common";

export const REPORT_KINDS: ReportKind[] = ["accident", "completion", "inspection", "repair"];

export const KIND_LABEL: Record<ReportKind, string> = {
  accident: "사고보고서",
  completion: "완료보고서",
  inspection: "점검보고서",
  repair: "보수요청서",
};

export const KIND_LAYOUT: Record<ReportKind, ReportLayout> = {
  accident: "accident",
  completion: "common",
  inspection: "common",
  repair: "common",
};

export const KIND_EMOJI: Record<ReportKind, string> = {
  accident: "🚨",
  completion: "✅",
  inspection: "🔍",
  repair: "🛠",
};

// 공통 양식: 소제목+본문 섹션
export type ReportTextSection = { id: string; heading: string; body: string };

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
function sec(heading: string, body = ""): ReportTextSection {
  _sid += 1;
  return { id: `s-${Date.now().toString(36)}-${_sid}`, heading, body };
}

function defaultSections(kind: ReportKind): ReportTextSection[] {
  switch (kind) {
    case "inspection":
      return [sec("점검 배경"), sec("점검 방법"), sec("점검 결과")];
    case "repair":
      return [sec("요청 배경"), sec("조치 방법"), sec("요청 사항")];
    case "completion":
      return [sec("배경"), sec("조치 내용"), sec("특이사항")];
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
};

// 공통 양식 정보표 4번째 칸 라벨
export const KIND_PLACE_LABEL: Record<ReportKind, string> = {
  accident: "발생 장소",
  completion: "작업 장소",
  inspection: "점검 장소",
  repair: "요청 위치",
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
    sections: r.sections ?? base.sections,
    photos: r.photos ?? [],
    accident: a,
  };
}
