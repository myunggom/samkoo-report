// 촬영 스케줄 · 완료보고서 데이터 타입 정의

export type Schedule = {
  id: string;
  title: string; // 촬영 제목 / 촬영명
  shootType: string; // 촬영종류 (드라마 / 영화 / 광고 / 화보 등)
  production: string; // 제작사
  manager: string; // 관리자
  start: string; // ISO datetime — 촬영일시(시작)
  end?: string; // ISO datetime — 종료(선택)
  // 보양 및 세팅 시간 (날짜+시간 범위)
  setupStart?: string; // ISO datetime
  setupEnd?: string; // ISO datetime
  // 촬영 및 철수 시간 (날짜+시간 범위)
  shootStart?: string; // ISO datetime
  shootEnd?: string; // ISO datetime
  // 구버전 자유 텍스트 값 (하위 호환용 — 새 값이 없을 때만 표시)
  setupTime?: string;
  shootTeardownTime?: string;
  createdAt: string;
};

export type Photo = {
  url: string;
  caption?: string;
};

export type ReportSection = "setup" | "shoot" | "teardown";

export const SECTION_LABELS: Record<ReportSection, string> = {
  setup: "보양 및 세팅",
  shoot: "촬영",
  teardown: "철수 및 정리",
};

export const SECTION_ORDER: ReportSection[] = ["setup", "shoot", "teardown"];

export type Report = {
  scheduleId: string;
  sections: Record<ReportSection, Photo[]>;
  // 겉표지 사진 (선택 — 미설정 시 건물 렌더링 사용)
  cover?: Photo;
  // 섹션별 특이사항 (섹션 페이지 하단에 표시)
  sectionNotes?: Partial<Record<ReportSection, string>>;
  // 마지막 특이사항 페이지 (사진 4장 2×2 + 우측 설명)
  specialPhotos?: Photo[];
  specialNote?: string;
  note?: string; // 구버전 전체 비고 (하위 호환)
  updatedAt: string;
};

export function emptyReport(scheduleId: string): Report {
  return {
    scheduleId,
    sections: { setup: [], shoot: [], teardown: [] },
    sectionNotes: {},
    updatedAt: new Date().toISOString(),
  };
}
