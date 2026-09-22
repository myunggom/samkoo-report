// 일정(캘린더 이벤트) — 업체 방문, 근무자 휴가, 점검/작업, 반복 작업 등

export type RepeatKind = "none" | "weekly" | "biweekly" | "monthly" | "monthly_weekday";

export type CalEvent = {
  id: string;
  date: string; // YYYY-MM-DD (시작일 / 반복 기준일)
  endDate?: string; // YYYY-MM-DD (일회성 기간 일정용 — 없으면 하루)
  type: string; // EVENT_TYPES 중 하나
  title: string; // 예: "○○업체 방문", "월간 소방점검"
  note?: string;
  repeat?: RepeatKind; // 반복 주기 (없으면 none)
  repeatUntil?: string; // 반복 종료일 (없으면 계속)
  doneDates?: string[]; // 회차별 완료 처리된 날짜(YYYY-MM-DD) 목록
  createdAt: string;
};

export const REPEAT_OPTIONS: { value: RepeatKind; label: string }[] = [
  { value: "none", label: "반복 안 함" },
  { value: "weekly", label: "매주" },
  { value: "biweekly", label: "격주(2주마다)" },
  { value: "monthly", label: "매월 (같은 날짜)" },
  { value: "monthly_weekday", label: "매월 (같은 요일)" },
];

export const REPEAT_LABEL: Record<RepeatKind, string> = {
  none: "",
  weekly: "매주",
  biweekly: "격주",
  monthly: "매월",
  monthly_weekday: "매월 요일",
};

// 매월 '같은 요일' 반복용: 그 달에서 해당 요일의 몇 번째인지 / 마지막인지
function weekdayNth(d: Date): number {
  return Math.floor((d.getDate() - 1) / 7) + 1;
}
function isLastWeekdayOfMonth(d: Date): boolean {
  const next = new Date(d);
  next.setDate(d.getDate() + 7);
  return next.getMonth() !== d.getMonth();
}

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function diffDays(a: string, b: string): number {
  return Math.round((ymdToDate(a).getTime() - ymdToDate(b).getTime()) / 86400000);
}

// 이벤트가 특정 날짜(ymd)에 발생하는지 (반복 포함)
export function occursOn(e: CalEvent, ymd: string): boolean {
  if (ymd < e.date) return false;
  if (e.repeatUntil && ymd > e.repeatUntil) return false;
  const rep = e.repeat || "none";
  if (rep === "none") {
    const end = e.endDate && e.endDate >= e.date ? e.endDate : e.date;
    return ymd >= e.date && ymd <= end;
  }
  if (rep === "weekly") {
    const dd = diffDays(ymd, e.date);
    return dd >= 0 && dd % 7 === 0;
  }
  if (rep === "biweekly") {
    const dd = diffDays(ymd, e.date);
    return dd >= 0 && dd % 14 === 0;
  }
  if (rep === "monthly") {
    return ymd.slice(8, 10) === e.date.slice(8, 10); // 매월 같은 '날짜'
  }
  if (rep === "monthly_weekday") {
    // 매월 같은 '요일' (예: 넷째 주 목요일). 시작일이 그 달 마지막 해당요일이면 '마지막 주'로 매칭.
    const start = ymdToDate(e.date);
    const target = ymdToDate(ymd);
    if (start.getDay() !== target.getDay()) return false;
    if (isLastWeekdayOfMonth(start)) return isLastWeekdayOfMonth(target);
    return weekdayNth(start) === weekdayNth(target);
  }
  return false;
}

// 해당 날짜 회차가 완료 처리됐는지
export function isDoneOn(e: CalEvent, ymd: string): boolean {
  return !!e.doneDates && e.doneDates.includes(ymd);
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const NTH = ["첫째", "둘째", "셋째", "넷째", "다섯째"];

// 사람이 읽는 반복 설명 (예: "매월 넷째 목요일", "매월 15일", "매주 목요일")
export function repeatDesc(e: CalEvent): string {
  const rep = e.repeat || "none";
  if (rep === "none") return "";
  const d = ymdToDate(e.date);
  const dow = DOW[d.getDay()] + "요일";
  if (rep === "weekly") return `매주 ${dow}`;
  if (rep === "biweekly") return `격주 ${dow}`;
  if (rep === "monthly") return `매월 ${d.getDate()}일`;
  if (rep === "monthly_weekday") {
    const nth = isLastWeekdayOfMonth(d) ? "마지막" : NTH[weekdayNth(d) - 1] || "";
    return `매월 ${nth} ${dow}`;
  }
  return "";
}

export const EVENT_TYPES = ["업체 방문", "근무자 휴가", "점검/작업", "기타"] as const;
export const DEFAULT_EVENT_TYPE = "업체 방문";

export const EVENT_STYLE: Record<string, string> = {
  "업체 방문": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "근무자 휴가": "bg-rose-100 text-rose-700 border-rose-200",
  "점검/작업": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "기타": "bg-slate-100 text-slate-600 border-slate-200",
};
// 캘린더 셀 안 작은 점/칩 색
export const EVENT_DOT: Record<string, string> = {
  "업체 방문": "bg-indigo-500",
  "근무자 휴가": "bg-rose-500",
  "점검/작업": "bg-emerald-500",
  "기타": "bg-slate-400",
};

export function eventStyle(t: string): string {
  return EVENT_STYLE[t] || EVENT_STYLE["기타"];
}
export function eventDot(t: string): string {
  return EVENT_DOT[t] || EVENT_DOT["기타"];
}

// date가 event 기간(date~endDate)에 포함되는지
export function eventCoversDay(e: CalEvent, ymd: string): boolean {
  const end = e.endDate && e.endDate >= e.date ? e.endDate : e.date;
  return ymd >= e.date && ymd <= end;
}
