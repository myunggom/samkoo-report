// 주간 업무보고 작성 데이터 (사장 전용 /weekly-report)
//
// 업무 항목(WeeklyItem) 여러 개 = 각 항목마다 제목 + 메모 + 사진 여러 장.
// 4단계에서 이 메모를 Claude API로 슬라이드 문구로 정리 → 주간보고 PPT 생성에 사용.

export type WeeklyPhoto = { url: string; caption?: string };

export type WeeklyItem = {
  id: string;
  title: string; // 업무 항목 제목 (예: 소방설비 점검)
  memo: string; // 담당자가 적는 메모(자유 서술) — 나중에 슬라이드 문구로 정리됨
  photos: WeeklyPhoto[];
};

export type WeeklyDraft = {
  items: WeeklyItem[];
  updatedAt: string;
};

export function newItemId(): string {
  return `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function emptyItem(): WeeklyItem {
  return { id: newItemId(), title: "", memo: "", photos: [] };
}

export function emptyDraft(): WeeklyDraft {
  return { items: [emptyItem()], updatedAt: new Date().toISOString() };
}
