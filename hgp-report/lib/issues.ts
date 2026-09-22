// 건물 내 문제(이슈) 누적 관리 — 접수 → 처리중 → 완료

export type IssueStatus = "open" | "in_progress" | "done";

export type IssuePhoto = { url: string; caption?: string };

export type Issue = {
  id: string;
  title: string; // 문제 요약
  note?: string; // 상세 내용
  area?: string; // 위치(구역)
  status: IssueStatus;
  photos?: IssuePhoto[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string; // 완료 처리 시각
};

export const ISSUE_STATUSES: IssueStatus[] = ["open", "in_progress", "done"];

export const STATUS_LABEL: Record<IssueStatus, string> = {
  open: "접수",
  in_progress: "처리중",
  done: "완료",
};

export const STATUS_STYLE: Record<IssueStatus, string> = {
  open: "bg-amber-100 text-amber-700 border-amber-200",
  in_progress: "bg-sky-100 text-sky-700 border-sky-200",
  done: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export const STATUS_COL_STYLE: Record<IssueStatus, string> = {
  open: "border-amber-200",
  in_progress: "border-sky-200",
  done: "border-emerald-200",
};

// "2026-08-28T..." → "8/28"
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function daysOpen(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}
