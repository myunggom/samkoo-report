// 고객사 주간 업무 보고 — 타입과 I/O 없는 순수 계산.
// 저장은 lib/store.ts, 화면은 app/weekly-log/page.tsx, 문서는 components/WeeklyLogDocument.tsx.
// (lib/weekly.ts 는 사장 전용 주간 업무보고로 별개)
//
// 한 주 = WeeklyLog 한 건. 새 주는 그 주 일일 업무일지를 분야별로 모아 초안을 만든다.

import type { DailyLog } from "./dailyLog";

export const WEEK_TITLE = "바이오 이노베이션 허브(프로젠·제넥신·셀리드 연구소) 주간 업무 보고";

// 주간 분야 ← 일일 업무일지 구분(WORK_SLOTS.key). 보안은 주간 보고에 없다.
export const WEEK_SLOTS: { key: string; from: string[] }[] = [
  { key: "행정", from: ["민원", "행정"] },
  { key: "전기", from: ["전기"] },
  { key: "기계", from: ["기계"] },
  { key: "건축", from: ["건축"] },
  { key: "소방", from: ["소방"] },
  { key: "미화", from: ["미화공용", "미화전용"] },
];

export type WeekEntry = { done?: string; plan?: string };

export type WeeklyLog = {
  date: string;       // 보고일 "2026-09-23" (저장 키)
  thisFrom: string;   // 이번주 업무수행 기간
  thisTo: string;
  nextFrom: string;   // 다음주 업무 계획 기간
  nextTo: string;
  work: Record<string, WeekEntry>;
  updatedAt: string;
};

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}

// "2026-09-18"~"2026-09-23" → "26.09.18~09.23" (예전 엑셀 머리글 형식)
export function periodLabel(from: string, to: string): string {
  return `${from.slice(2).replaceAll("-", ".")}~${to.slice(5).replace("-", ".")}`;
}

// 번호 매긴 목록을 항목 단위로 쪼갠다. "- " 로 시작하는 줄은 앞 항목의 하위 줄.
export function splitItems(text: string | undefined): string[][] {
  const items: string[][] = [];
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const sub = /^\s*[-·]/.test(line);
    if (sub && items.length) items[items.length - 1].push(line.trim());
    else items.push([line.replace(/^\s*\d+[.)]\s*/, "").trim()]);
  }
  return items;
}

// 항목 목록을 "1. 항목\n - 하위" 형태로. 같은 항목(첫 줄)은 한 번만, 하위 줄은 합친다.
export function joinItems(items: string[][]): string {
  const merged = new Map<string, string[]>();
  for (const [head, ...subs] of items) {
    const key = head.replace(/\s+/g, " ");
    const cur = merged.get(key) ?? [];
    for (const s of subs) if (!cur.includes(s)) cur.push(s);
    merged.set(key, cur);
  }
  return [...merged].map(([h, subs], i) => [`${i + 1}. ${h}`, ...subs.map((s) => ` ${s}`)].join("\n")).join("\n");
}

// 기간 안 일일 업무일지를 분야별로 모은다: 금일 업무(+추가 줄) → 이번주, 마지막 일지의 명일 계획 → 다음주
export function compileFromDaily(dailies: DailyLog[], from: string, to: string): Record<string, WeekEntry> {
  const days = dailies.filter((d) => d.date >= from && d.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const last = days[days.length - 1];
  const out: Record<string, WeekEntry> = {};
  for (const s of WEEK_SLOTS) {
    const done = joinItems(days.flatMap((d) => s.from.flatMap((k) => [...splitItems(d.work[k]?.today), ...splitItems(d.work[k]?.extra)])));
    const plan = last ? joinItems(s.from.flatMap((k) => splitItems(last.work[k]?.plan))) : "";
    if (done || plan) out[s.key] = { done: done || undefined, plan: plan || undefined };
  }
  return out;
}

// 새 보고일 초안: 기간은 지난 보고 다음 날부터 보고일까지, 다음주는 보고일 다음 날부터 7일.
// 내용은 그 기간 일일 업무일지에서 모으고, 일지가 없는 분야는 지난주 '다음주 계획'을 이번주로 옮긴다.
export function draftWeekly(weeklies: WeeklyLog[], dailies: DailyLog[], date: string): WeeklyLog {
  const existing = weeklies.find((w) => w.date === date);
  if (existing) return existing;
  const prev = [...weeklies].filter((w) => w.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const thisFrom = prev ? addDays(prev.date, 1) : addDays(date, -6);
  const work = compileFromDaily(dailies, thisFrom, date);
  for (const s of WEEK_SLOTS) {
    if (!work[s.key]?.done && prev?.work[s.key]?.plan) work[s.key] = { ...work[s.key], done: prev.work[s.key].plan };
  }
  return { date, thisFrom, thisTo: date, nextFrom: addDays(date, 1), nextTo: addDays(date, 7), work, updatedAt: "" };
}

export function normalizeWeekly(input: unknown): WeeklyLog | null {
  const it = (input ?? {}) as Record<string, unknown>;
  const d = (v: unknown) => (typeof v === "string" && DATE_RE.test(v) ? v : null);
  const date = d(it.date), thisFrom = d(it.thisFrom), thisTo = d(it.thisTo), nextFrom = d(it.nextFrom), nextTo = d(it.nextTo);
  if (!date || !thisFrom || !thisTo || !nextFrom || !nextTo) return null;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.replace(/\r\n/g, "\n").trimEnd() : undefined);
  const w = (it.work ?? {}) as Record<string, Record<string, unknown>>;
  const work: Record<string, WeekEntry> = {};
  for (const s of WEEK_SLOTS) {
    const e = { done: text(w[s.key]?.done), plan: text(w[s.key]?.plan) };
    if (e.done || e.plan) work[s.key] = e;
  }
  return { date, thisFrom, thisTo, nextFrom, nextTo, work, updatedAt: new Date().toISOString() };
}
