// 주간업무보고 → 예전 엑셀과 같은 파일. 보고일마다 시트("2026.09.23"), 최신 주가 맨 앞이고 열면 그 시트가 보인다.
// 양식은 public/weekly-log-template.xlsx — 예전 엑셀 2026.09.23 시트에서 내용만 비운 것.

import type { WeeklyLog } from "./weeklyLog.ts";
import { WEEK_SLOTS, periodLabel } from "./weeklyLog.ts";
import { assembleWorkbook, setCell } from "./dailyLogXlsx.ts";

export const weeklyXlsxFileName = (date: string) => `[주간업무보고] 바이오 이노베이션 허브_${date.replace(/-/g, ".")}.xlsx`;

// 내용 줄 수에 맞춰 행 높이(pt)를 정한다 — 양식 행은 높이가 고정이라 줄이 많으면 잘린다.
// ponytail: 글자 폭은 한글 2·그 외 1 로 어림하고 한 줄 95 단위에서 접힌다고 본다(엑셀 열 너비 98). 실제 글꼴 폭과 조금 다를 수 있음.
export function rowHeight(...texts: (string | undefined)[]): number {
  const lines = Math.max(1, ...texts.map((t) => (t ?? "").split("\n").reduce((n, line) => {
    const units = [...line].reduce((u, ch) => u + (/[ᄀ-￿]/.test(ch) ? 2 : 1), 0);
    return n + Math.max(1, Math.ceil(units / 95));
  }, 0)));
  return Math.max(60, Math.round(lines * 22 + 16));
}

function setRowHeight(xml: string, r: number, ht: number): string {
  return xml.replace(new RegExp(`<row r="${r}"([^>]*?) ht="[\\d.]+"`), `<row r="${r}"$1 ht="${ht}"`);
}

export function fillWeeklySheet(tpl: string, w: WeeklyLog): string {
  let x = setCell(tpl, "B3", `이번주 업무수행(${periodLabel(w.thisFrom, w.thisTo)})`);
  x = setCell(x, "C3", `다음주 업무 계획(${periodLabel(w.nextFrom, w.nextTo)})`);
  WEEK_SLOTS.forEach((s, i) => {
    const r = 5 + i; // 양식 A5~A10 = 행정·전기·기계·건축·소방·미화 (WEEK_SLOTS 순서)
    const e = w.work[s.key] ?? {};
    x = setCell(x, `B${r}`, e.done);
    x = setCell(x, `C${r}`, e.plan);
    x = setRowHeight(x, r, rowHeight(e.done, e.plan));
  });
  return x;
}

// date 보고일 기준: 같은 해 그날까지의 주간보고, 최신이 맨 앞
export function buildWeeklyXlsx(template: ArrayBuffer | Uint8Array, weeklies: WeeklyLog[], date: string): Uint8Array {
  const weeks = weeklies.filter((w) => w.date.startsWith(date.slice(0, 5)) && w.date <= date).sort((a, b) => b.date.localeCompare(a.date));
  if (weeks[0]?.date !== date) throw new Error("이 날 주간보고가 저장되어 있지 않습니다");
  return assembleWorkbook(template, (tpl) => weeks.map((w) => ({ name: w.date.replace(/-/g, "."), xml: fillWeeklySheet(tpl, w) })), 0);
}
