// 일일 업무일지(고객사 보고용) — 타입과 I/O 없는 순수 계산.
// 저장은 lib/store.ts, 화면은 app/daily-log/page.tsx, 문서는 components/DailyLogDocument.tsx.
//
// 하루 = DailyLog 한 건. 계량은 "금일 지침"만 저장하고 전일검침·사용량·월 누계는
// 여기서 계산한다(예전 엑셀은 날짜마다 시트를 복사하고 누계를 전날 시트에 줄줄이 이어
// 붙여서, 하루만 빠져도 그 뒤 누계가 다 틀어졌다).

import { merge3 } from "./merge.ts";

export type WorkSlot = {
  key: string;
  label: string;   // 보고서 왼쪽 칸 이름
  plan: boolean;   // 명일 계획 칸이 있는가
  extra: boolean;  // 두 번째 줄(협력업체 등)이 있는가
  note: boolean;   // 비고 칸이 있는가
};

export const WORK_SLOTS: WorkSlot[] = [
  { key: "민원", label: "민원사항", plan: true, extra: false, note: true },
  { key: "행정", label: "행정", plan: true, extra: false, note: true },
  { key: "전기", label: "전기", plan: true, extra: true, note: true },
  { key: "기계", label: "기계", plan: true, extra: true, note: true },
  { key: "소방", label: "소방", plan: true, extra: true, note: true },
  { key: "건축", label: "건축", plan: true, extra: true, note: true },
  { key: "보안", label: "보안 / 안내", plan: true, extra: true, note: true },
  { key: "미화공용", label: "공용부", plan: true, extra: true, note: false },
  { key: "미화전용", label: "전용부", plan: true, extra: false, note: false },
];

export type WorkEntry = { today?: string; plan?: string; extra?: string; note?: string };

export const TEAMS = ["시설", "보안/안내", "미화", "본사"] as const;

export type People = {
  to: number[];      // TEAMS 순서
  actual: number[];  // TEAMS 순서
  off: number;       // 비번
  leave: number;     // 휴가
  note?: string;
};

export type MeterKey = "power" | "solar" | "heat" | "cool" | "water" | "gray" | "gas";

export type MeterDef = {
  key: MeterKey;
  group: "전기" | "기계";
  label: string;
  unit: string;
  factor?: number;     // 사용량 배율 (전력량계 CT 배율)
  daily?: boolean;     // true면 지침이 아니라 그날 발전량 자체를 입력
};

export const METERS: MeterDef[] = [
  { key: "power", group: "전기", label: "전력사용량", unit: "kWh", factor: 3600 },
  { key: "solar", group: "전기", label: "태양광 발전량", unit: "kWh", daily: true },
  { key: "heat", group: "기계", label: "지역난방(난방)", unit: "MWh" },
  { key: "cool", group: "기계", label: "지역난방(냉방)", unit: "MWh" },
  { key: "water", group: "기계", label: "수도", unit: "㎥" },
  { key: "gray", group: "기계", label: "중수", unit: "㎥" },
  { key: "gas", group: "기계", label: "가스", unit: "㎥" },
];

export type DailyLog = {
  date: string;                          // "2026-09-29"
  people?: People;
  work: Record<string, WorkEntry>;       // WORK_SLOTS.key → 내용
  special?: string;                      // 특이사항
  meters: Partial<Record<MeterKey, number>>;
  // 전력량계 3요소 지침 (POWER_PARTS 순서). 있으면 meters.power = 세 값의 합
  powerParts?: number[];
  // 태양광 모니터링의 "금월 발전량"(MWh) 입력값. 있으면 meters.solar = 이 값×1000 − 어제까지 이번 달 발전량
  solarMonthMWh?: number;
  updatedAt: string;
};

// 태양광: 금월 누적(MWh) → 그날 발전량(kWh). 어제까지는 이번 달 일지에 적힌 일 발전량의 합.
// 주말처럼 일지가 빠진 날의 발전량은 다음 일지에 합쳐진다 (예전 엑셀도 같았다).
export function solarFromMonthTotal(logs: DailyLog[], date: string, monthMWh: number): number {
  const monthStart = date.slice(0, 8) + "01";
  const before = logs
    .filter((l) => l.date >= monthStart && l.date < date)
    .reduce((s, l) => s + (typeof l.meters.solar === "number" ? l.meters.solar : 0), 0);
  return Math.round((monthMWh * 1000 - before) * 10) / 10;
}

// 전력량계는 시간대별 3요소를 따로 읽는다 — 전력 지침은 그 합 (엑셀 '전기 에너지 사용량' I·J·K 열)
export const POWER_PARTS = ["주간·중부하", "저녁·최대부하", "심야·경부하"] as const;

export function sumParts(parts: number[]): number {
  return Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
}

export type MeterRow = {
  def: MeterDef;
  prev: number | null;    // 전일검침 (태양광은 이번 달 어제까지 누계)
  today: number | null;   // 금일검침 (태양광은 그날 발전량)
  usage: number | null;   // 사용량 (태양광은 빈칸)
  month: number;          // 월 누계
  warn?: string;
};

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
// 지침 뺄셈의 부동소수 찌꺼기(1187.9999…) 정리
const clean = (v: number) => Math.round(v * 1e6) / 1e6;

function sorted(logs: DailyLog[]): DailyLog[] {
  return [...logs].sort((a, b) => a.date.localeCompare(b.date));
}

// 그 날짜 이전에 이 계량기 값이 있는 가장 최근 기록
function prevReading(logs: DailyLog[], date: string, key: MeterKey): number | null {
  let best: DailyLog | null = null;
  for (const l of logs) {
    if (l.date < date && num(l.meters[key]) !== null && (!best || l.date > best.date)) best = l;
  }
  return best ? num(best.meters[key]) : null;
}

// 그날의 사용량 (전일 지침이 없으면 null)
export function usageOn(logs: DailyLog[], date: string, def: MeterDef): number | null {
  const log = logs.find((l) => l.date === date);
  const today = num(log?.meters[def.key]);
  if (today === null) return null;
  if (def.daily) return today;
  const prev = prevReading(logs, date, def.key);
  if (prev === null) return null;
  return clean((today - prev) * (def.factor ?? 1));
}

export function meterRows(logs: DailyLog[], date: string): MeterRow[] {
  const monthStart = date.slice(0, 8) + "01";
  const inMonth = sorted(logs).filter((l) => l.date >= monthStart && l.date <= date);
  return METERS.map((def) => {
    const log = logs.find((l) => l.date === date);
    const today = num(log?.meters[def.key]);
    const usages = inMonth.map((l) => ({ date: l.date, u: usageOn(logs, l.date, def) }));
    const monthTotal = clean(usages.reduce((s, x) => s + (x.u ?? 0), 0));
    if (def.daily) {
      const before = clean(usages.filter((x) => x.date < date).reduce((s, x) => s + (x.u ?? 0), 0));
      return { def, prev: before, today, usage: null, month: monthTotal, warn: today !== null && today < 0 ? "금월 발전량이 어제까지 합보다 작습니다" : undefined };
    }
    const usage = usageOn(logs, date, def);
    let warn: string | undefined;
    if (usage !== null && usage < 0) warn = "지침이 전일보다 작습니다";
    else if (usage !== null) {
      // 최근 사용량 평균의 3배를 넘으면 누수·오타 의심
      const hist = sorted(logs)
        .filter((l) => l.date < date)
        .map((l) => usageOn(logs, l.date, def))
        .filter((u): u is number => u !== null && u > 0)
        .slice(-10);
      if (hist.length >= 5 && usage > 3 * (hist.reduce((a, b) => a + b, 0) / hist.length)) warn = "평소의 3배가 넘습니다";
    }
    return { def, prev: prevReading(logs, date, def.key), today, usage, month: monthTotal, warn };
  });
}

// 새 날짜 입력용 초안 — 가장 최근 기록의 인원과 '명일 계획'을 오늘 '금일'로 채워 둔다.
export function draftFor(logs: DailyLog[], date: string): DailyLog {
  const existing = logs.find((l) => l.date === date);
  if (existing) return existing;
  const prev = sorted(logs).filter((l) => l.date < date && (l.people || Object.keys(l.work).length)).pop();
  const work: Record<string, WorkEntry> = {};
  for (const s of WORK_SLOTS) {
    const p = prev?.work[s.key];
    if (!p) continue;
    const e: WorkEntry = { today: p.plan || undefined, plan: p.plan || undefined, extra: p.extra, note: p.note };
    if (Object.values(e).some(Boolean)) work[s.key] = e;
  }
  return { date, people: prev?.people, work, meters: {}, updatedAt: "" };
}

// 저장 전 정리 — 모르는 구분·빈 문자열·숫자가 아닌 값은 버린다 (API 입력 검증)
export function normalizeLog(input: unknown): DailyLog | null {
  const it = (input ?? {}) as Record<string, unknown>;
  const date = typeof it.date === "string" && DATE_RE.test(it.date) ? it.date : null;
  if (!date) return null;
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.replace(/\r\n/g, "\n").trimEnd() : undefined);
  const count = (v: unknown) => {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
  };

  const work: Record<string, WorkEntry> = {};
  const w = (it.work ?? {}) as Record<string, Record<string, unknown>>;
  for (const s of WORK_SLOTS) {
    const src = w[s.key] ?? {};
    const e: WorkEntry = {
      today: text(src.today),
      plan: s.plan ? text(src.plan) : undefined,
      extra: s.extra ? text(src.extra) : undefined,
      note: s.note ? text(src.note) : undefined,
    };
    if (Object.values(e).some(Boolean)) work[s.key] = e;
  }

  const meters: Partial<Record<MeterKey, number>> = {};
  const m = (it.meters ?? {}) as Record<string, unknown>;
  for (const d of METERS) {
    const v = typeof m[d.key] === "string" && (m[d.key] as string).trim() !== "" ? Number(m[d.key]) : m[d.key];
    if (typeof v === "number" && Number.isFinite(v)) meters[d.key] = v;
  }

  // 3요소가 모두 숫자면 합을 전력 지침으로 쓴다 (한 칸이라도 비면 버리고 입력된 power 를 그대로)
  let powerParts: number[] | undefined;
  if (Array.isArray(it.powerParts) && it.powerParts.length === POWER_PARTS.length) {
    const ps = it.powerParts.map((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v));
    if (ps.every((v) => typeof v === "number" && Number.isFinite(v))) {
      powerParts = ps as number[];
      meters.power = sumParts(powerParts);
    }
  }

  const smw = typeof it.solarMonthMWh === "string" && it.solarMonthMWh.trim() !== "" ? Number(it.solarMonthMWh) : it.solarMonthMWh;
  const solarMonthMWh = typeof smw === "number" && Number.isFinite(smw) && smw >= 0 ? smw : undefined;

  let people: People | undefined;
  const p = it.people as Record<string, unknown> | undefined;
  if (p && typeof p === "object") {
    const arr = (v: unknown) => TEAMS.map((_, i) => count(Array.isArray(v) ? v[i] : 0));
    people = { to: arr(p.to), actual: arr(p.actual), off: count(p.off), leave: count(p.leave), note: text(p.note) };
  }

  return { date, people, work, special: text(it.special), meters, powerParts, solarMonthMWh, updatedAt: new Date().toISOString() };
}

export function sumPeople(xs: number[] | undefined): number {
  return (xs ?? []).reduce((a, b) => a + (b || 0), 0);
}

const WEEK = "일월화수목금토";
export function dateLabel(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  return `${date} (${WEEK[d.getUTCDay()]})`;
}

// 표시용 숫자 (소수 자리 고정)
export function fmt(v: number | null, digits = 2): string {
  if (v === null) return "";
  return v.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// ── 동시 편집 합치기 (lib/merge.ts) ───────────────────────────────
export function mergeLog(server: DailyLog | undefined, base: DailyLog | undefined, mine: DailyLog): { log: DailyLog; conflicts: string[]; others: number } {
  if (!server) return { log: mine, conflicts: [], others: 0 };
  const m = merge3(server, base, mine);
  // 합친 뒤 다시 정리 — 3요소가 바뀌었으면 전력 지침도 다시 계산된다
  const log = normalizeLog(m.value)!;
  return { log, conflicts: m.conflicts.filter((c) => c !== "meters.power" || !log.powerParts), others: m.others };
}

// conflicts 경로 → 화면 이름 ("work.전기.today" → "전기 금일")
export function conflictLabel(p: string): string {
  const [a, b, c] = p.split(".");
  if (a === "work") {
    const slot = WORK_SLOTS.find((s) => s.key === b)?.label ?? b;
    return `${slot} ${({ today: "금일", plan: "명일", extra: "협력업체", note: "비고" } as Record<string, string>)[c] ?? c}`;
  }
  if (a === "meters") return METERS.find((m) => m.key === b)?.label ?? b;
  if (a === "people") return b === "to" || b === "actual" ? `인원 ${b === "to" ? "T/O" : "실인원"} ${TEAMS[Number(c)] ?? ""}` : "인원";
  if (a === "special") return "특이사항";
  if (a === "powerParts") return "전력량계 지침";
  if (a === "solarMonthMWh") return "태양광 금월 발전량";
  return p;
}
