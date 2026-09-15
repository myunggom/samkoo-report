// 개인 업무 관리 — 타입·상수와 I/O 없는 순수 함수.
// 저장은 lib/store.ts, 화면은 app/tasks/page.tsx가 담당한다.

export type TaskStatus = "todo" | "doing" | "done";
export type TaskCategory = "facility" | "contract" | "report" | "meeting" | "etc";
export type DueGroup = "overdue" | "today" | "week" | "later" | "none";

export type Task = {
  id: string;
  title: string;       // 할 일 한 줄 요약
  note?: string;       // 상세
  category: TaskCategory;
  status: TaskStatus;
  due?: string;        // "2026-09-19" — KST 기준 날짜
  source?: string;     // 이 할 일의 근거가 된 원문 문장
  issueId?: string;    // 문제 관리로 공유했으면 연결
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
  doneAt?: string;     // ISO 8601
};

export const TASK_CATEGORIES: TaskCategory[] = ["facility", "contract", "report", "meeting", "etc"];

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  facility: "시설·안전",
  contract: "계약·행정",
  report: "보고·문서",
  meeting: "회의·사람",
  etc: "기타",
};

export const CATEGORY_STYLE: Record<TaskCategory, string> = {
  facility: "bg-rose-50 text-rose-700 border-rose-200",
  contract: "bg-violet-50 text-violet-700 border-violet-200",
  report: "bg-sky-50 text-sky-700 border-sky-200",
  meeting: "bg-amber-50 text-amber-700 border-amber-200",
  etc: "bg-slate-100 text-slate-600 border-slate-200",
};

// 화면 표시 순서 — 지남이 맨 위
export const DUE_GROUPS: DueGroup[] = ["overdue", "today", "week", "later", "none"];

export const DUE_GROUP_LABEL: Record<DueGroup, string> = {
  overdue: "지남",
  today: "오늘",
  week: "이번 주",
  later: "다음",
  none: "기한 없음",
};

export const DUE_GROUP_STYLE: Record<DueGroup, string> = {
  overdue: "bg-red-100 text-red-700 border-red-200",
  today: "bg-orange-100 text-orange-700 border-orange-200",
  week: "bg-sky-100 text-sky-700 border-sky-200",
  later: "bg-slate-100 text-slate-600 border-slate-200",
  none: "bg-slate-50 text-slate-400 border-slate-200",
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Date → KST 기준 "YYYY-MM-DD"
export function kstDateString(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// KST 기준 이번 주 일요일 "YYYY-MM-DD" (오늘이 일요일이면 오늘)
function endOfKstWeek(now: Date): string {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const daysToSunday = (7 - kst.getUTCDay()) % 7; // 0=일요일
  return new Date(kst.getTime() + daysToSunday * 86400000).toISOString().slice(0, 10);
}

// "YYYY-MM-DD" 문자열은 사전순 비교가 곧 날짜순 비교라 그대로 비교한다.
export function dueGroup(due: string | undefined, now: Date): DueGroup {
  if (!due || !DATE_RE.test(due)) return "none";
  const today = kstDateString(now);
  if (due < today) return "overdue";
  if (due === today) return "today";
  return due <= endOfKstWeek(now) ? "week" : "later";
}
