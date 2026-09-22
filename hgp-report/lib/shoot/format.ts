// 날짜/시간 표시 및 메일 문안 생성 유틸

import type { Schedule } from "./types";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ISO datetime(로컬 입력값) → "2026-08-28"
export function ymd(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "2026년 8월 28일 (목) 09:30"
export function prettyDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]}) ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// "8월 28일 (목)"
export function prettyDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
}

// "09:30"
export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 촬영 기간 문구: 시작~종료가 같은 날이면 하루, 다르면 기간
export function shootPeriod(s: Schedule): string {
  const start = new Date(s.start);
  const base = `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 (${
    WEEK[start.getDay()]
  })`;
  if (!s.end) return base;
  const end = new Date(s.end);
  if (ymd(s.start) === ymd(s.end)) {
    return `${base} ${hhmm(s.start)}~${hhmm(s.end)}`;
  }
  return `${base} ~ ${end.getFullYear()}년 ${end.getMonth() + 1}월 ${end.getDate()}일 (${
    WEEK[end.getDay()]
  })`;
}

// 날짜+시간 범위 문구 (예: "2026년 8월 29일 (목) 02:00 ~ 05:00")
// startIso가 없으면 legacy 텍스트 값으로 대체
export function formatRange(startIso?: string, endIso?: string, legacy?: string): string {
  if (!startIso) return legacy?.trim() || "-";
  const s = new Date(startIso);
  const base = `${s.getFullYear()}년 ${s.getMonth() + 1}월 ${s.getDate()}일 (${WEEK[s.getDay()]}) ${hhmm(startIso)}`;
  if (!endIso) return base;
  if (ymd(startIso) === ymd(endIso)) return `${base} ~ ${hhmm(endIso)}`;
  const e = new Date(endIso);
  return `${base} ~ ${e.getFullYear()}년 ${e.getMonth() + 1}월 ${e.getDate()}일 (${WEEK[e.getDay()]}) ${hhmm(endIso)}`;
}

export function setupRange(s: Schedule): string {
  return formatRange(s.setupStart, s.setupEnd, s.setupTime);
}
export function shootRange(s: Schedule): string {
  return formatRange(s.shootStart, s.shootEnd, s.shootTeardownTime);
}

// 촬영 완료 보고 메일 문안 자동 생성
export function buildEmailBody(s: Schedule): string {
  const type = s.shootType?.trim() || "촬영";
  return `안녕하십니까.

한독 및 제넥신&프로젠 ${type} "${s.title}" 촬영이 완료되어 촬영완료보고서를 첨부드립니다. 업무에 참고하시기 바랍니다.

※ 내용
1. ${type} 제목 : ${s.title}
2. 제작사 : ${s.production}
3. 촬영 기간 : ${shootPeriod(s)}
4. 세팅 및 촬영 시간
 - 보양 및 세팅 : ${setupRange(s)}
 - 촬영 및 철수 : ${shootRange(s)}

감사합니다.`;
}

export function emailSubject(s: Schedule): string {
  const type = s.shootType?.trim() || "촬영";
  return `[촬영완료보고] ${type} "${s.title}" (${prettyDate(s.start)})`;
}
