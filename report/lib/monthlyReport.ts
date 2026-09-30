// 고객사 월간 보고서 — 타입과 I/O 없는 순수 계산.
// 저장은 lib/store.ts, 화면은 app/monthly-report/page.tsx, 문서는 components/MonthlyReportDocument.tsx.
//
// 한 달 = MonthlyReport 한 건(보고월 "2026-09"). 새 달은 지난달 보고서를 복사한 초안에서 시작하고
// 매달 바뀌는 칸만 고친다. 에너지 사용량·요금은 한 해치 배열을 보고서마다 들고 간다(지난달에서 복사).

export const SITE = "바이오 이노베이션 허브";
export const AREA_M2 = 41610.35; // ㎡당 계산에 쓰는 연면적 (엑셀과 같은 값)

export const COVER_SLOTS = ["행정", "전기", "기계", "건축", "소방", "미화", "보안"] as const;
export const TRADES = ["기계", "미화", "전기", "건축", "소방", "보안"] as const; // 4-2 작업사진 공종 (엑셀 순서)
export const SETS_PER_TRADE = 12;

export type EnergyKey = "elec" | "water" | "heat" | "gray" | "gas";
export const ENERGY: { key: EnergyKey; no: string; label: string; unit: string; note: string }[] = [
  { key: "elec", no: "2-2", label: "전기", unit: "kWh", note: "전기 검침일 : 전월 10일 ~ 당월 9일" },
  { key: "water", no: "2-3", label: "수도", unit: "㎥", note: "" },
  { key: "heat", no: "2-4", label: "열(냉난방)", unit: "MWh", note: "" },
  { key: "gray", no: "2-5", label: "중수", unit: "㎥", note: "" },
  { key: "gas", no: "2-6", label: "가스", unit: "㎥", note: "" },
];

export type Photo = { url?: string; caption?: string };
export type Num = number | null;

export type EnergyData = {
  usage: Num[];      // 올해 1~12월
  cost: Num[];
  prevUsage: Num[];  // 작년 1~12월
  prevCost: Num[];
  usageNote?: string;
  costNote?: string;
};

export type Staff = {
  group: string;   // 본사 / 지원, 바이오 이노베이션 허브
  dept: string;    // 총괄, 행정, 시설, 미화
  title: string;   // 직급
  to: number;
  name: string;
  ext?: string;
  phone?: string;
  start?: string;  // 투입일자
  shift?: number;  // 교대기사: 근무표 달 1일의 주기 위치(0~5, SHIFT_CYCLE). 없으면 일반 근무
};

export type MonthlyReport = {
  month: string;   // 보고월 "2026-09"
  coverImage?: string;
  cover: Record<string, { now?: string; next?: string }>;
  education: { rows: { name: string; org: string; trainees: string; date: string; place: string; note: string }[]; photos: Photo[] };
  orgImage?: string;
  costNotes: Record<string, string>;            // 2-1 증감분석 내용
  energy: Record<EnergyKey, EnergyData>;
  tenantsImage?: string;
  contacts: { tenant: string; floor: string; person: string; tel: string; mobile: string; count: string; note: string }[];
  facility: { group: string; sub: string; content: string; status: "완료" | "진행중" | "계획중" | ""; note: string }[];
  photos: Record<string, { name: string; a?: string; b?: string }[]>;  // 공종 → 12세트
  nextPlan: { group: string; content: string; when: string; note: string }[];
  staff: Staff[];
  holidays: string[];                            // 근무표 달의 공휴일 "YYYY-MM-DD"
  overrides: Record<string, Record<string, string>>; // 이름 → {날짜: 근무코드} (연차 등 수동 변경)
  scheduleNote?: string;
  updatedAt: string;
};

// ── 날짜 ──────────────────────────────────────────────────────────
export const MONTH_RE = /^\d{4}-\d{2}$/;

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function daysIn(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export function weekday(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay(); // 0=일
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}년 ${m}월`;
}

// ── 공휴일 ────────────────────────────────────────────────────────
// ponytail: 음력 명절·대체공휴일·선거일을 해마다 표로 둔다. 2028년부터는 이 표에 추가할 것(화면에서 달마다 고칠 수도 있음).
const HOLIDAYS: Record<string, string[]> = {
  "2026": [
    "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", "2026-03-01", "2026-03-02", "2026-05-05", "2026-05-24",
    "2026-05-25", "2026-06-03", "2026-06-06", "2026-08-15", "2026-08-17", "2026-09-24", "2026-09-25", "2026-09-26",
    "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25",
  ],
  "2027": [
    "2027-01-01", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-03-01", "2027-05-05", "2027-05-13",
    "2027-06-06", "2027-08-15", "2027-08-16", "2027-09-14", "2027-09-15", "2027-09-16", "2027-10-03", "2027-10-04",
    "2027-10-09", "2027-10-11", "2027-12-25", "2027-12-27",
  ],
};

export function holidaysOf(month: string): string[] {
  return (HOLIDAYS[month.slice(0, 4)] ?? []).filter((d) => d.startsWith(month));
}

// ── 근무표 ────────────────────────────────────────────────────────
export const SHIFT_CYCLE = ["주", "주", "야", "야", "비", "비"] as const;

export function isShift(s: Staff): boolean {
  return typeof s.shift === "number";
}

// 그 달 근무표 한 줄. 교대기사는 1일 주기 위치부터 6일 순환, 나머지는 평일 주·주말·공휴일 휴. 수동 변경이 우선.
export function scheduleRow(s: Staff, month: string, holidays: string[], overrides?: Record<string, string>): string[] {
  const hol = new Set(holidays);
  return daysIn(month).map((d, i) => {
    if (overrides?.[d]) return overrides[d];
    if (isShift(s)) return SHIFT_CYCLE[(((s.shift as number) + i) % 6 + 6) % 6];
    const wd = weekday(d);
    return wd === 0 || wd === 6 || hol.has(d) ? "휴" : "주";
  });
}

// 다음 달 1일의 주기 위치 = 이번 달 1일 위치 + 이번 달 일수
export function nextShift(shift: number, month: string): number {
  return (shift + daysIn(month).length) % 6;
}

// ── 에너지 통계 (엑셀 2-2~2-6 수식과 같은 규칙) ─────────────────────
export function monthDays(year: number, m: number): number {
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

export function energyStats(v: Num[]) {
  const nums = v.filter((x): x is number => typeof x === "number" && x > 0);
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = nums.length ? sum / nums.length : null;
  return {
    sum,
    avg,
    dayAvg: avg === null ? null : avg / 30,
    max: nums.length ? Math.max(...nums) : null,
    min: nums.length ? Math.min(...nums) : null,
  };
}

// 전년 대비 증감: 올해 값이 있을 때만
export function diff(cur: Num, prev: Num): Num {
  return typeof cur === "number" && cur > 0 ? cur - (prev ?? 0) : null;
}
export function rate(cur: Num, prev: Num): Num {
  return typeof cur === "number" && cur > 0 && typeof prev === "number" && prev > 0 ? (cur - prev) / prev : null;
}

// ── 초안 ──────────────────────────────────────────────────────────
const blankEnergy = (): EnergyData => ({ usage: Array(12).fill(null), cost: Array(12).fill(null), prevUsage: Array(12).fill(null), prevCost: Array(12).fill(null) });

export function emptyReport(month: string): MonthlyReport {
  return {
    month,
    cover: {},
    education: { rows: [], photos: [{}, {}, {}, {}] }, // 교육자료·회의록·교육 사진·안전상황판
    costNotes: {},
    energy: { elec: blankEnergy(), water: blankEnergy(), heat: blankEnergy(), gray: blankEnergy(), gas: blankEnergy() },
    contacts: [],
    facility: [],
    photos: Object.fromEntries(TRADES.map((t) => [t, Array.from({ length: SETS_PER_TRADE }, () => ({ name: "" }))])),
    nextPlan: [],
    staff: [],
    holidays: holidaysOf(addMonths(month, 1)),
    overrides: {},
    updatedAt: "",
  };
}

// 새 달 초안: 지난달 보고서를 복사하고 달마다 바뀌는 것만 비운다.
//  · 표지: 지난달 '차월 실시 사항'을 이번 달 '당월'로, 차월은 비움
//  · 작업사진: 작업명은 남기고 사진은 비움 / 근무표: 교대 주기를 한 달 넘기고 수동 변경·공휴일 새로
//  · 에너지: 해가 바뀌면 올해 값을 작년 칸으로
export function draftMonthly(reports: MonthlyReport[], month: string): MonthlyReport {
  const existing = reports.find((r) => r.month === month);
  if (existing) return existing;
  const prev = [...reports].filter((r) => r.month < month).sort((a, b) => b.month.localeCompare(a.month))[0];
  if (!prev) return emptyReport(month);
  const r: MonthlyReport = structuredClone(prev);
  r.month = month;
  r.cover = Object.fromEntries(COVER_SLOTS.map((k) => [k, { now: prev.cover[k]?.next, next: undefined }]));
  r.education = { rows: prev.education.rows.map((x) => ({ ...x, date: "" })), photos: [{}, {}, {}, {}] };
  for (const t of TRADES) r.photos[t] = (prev.photos[t] ?? []).map((s) => ({ name: s.name }));
  // 근무표는 보고월 다음 달. 지난 보고서의 근무표 달 → 이번 근무표 달로 주기를 넘긴다
  let m = addMonths(prev.month, 1);
  const target = addMonths(month, 1);
  r.staff = prev.staff.map((s) => ({ ...s }));
  while (m < target) {
    for (const s of r.staff) if (isShift(s)) s.shift = nextShift(s.shift as number, m);
    m = addMonths(m, 1);
  }
  r.holidays = holidaysOf(target);
  r.overrides = {};
  if (month.slice(0, 4) !== prev.month.slice(0, 4)) {
    for (const e of ENERGY) {
      const p = r.energy[e.key];
      r.energy[e.key] = { usage: Array(12).fill(null), cost: Array(12).fill(null), prevUsage: p.usage, prevCost: p.cost };
    }
  }
  r.updatedAt = "";
  return r;
}

// 저장 전 검사 — 잠금 없는 탭이라 모양과 크기를 확인한다
export function normalizeMonthly(input: unknown): MonthlyReport | null {
  const it = input as MonthlyReport | null;
  if (!it || typeof it !== "object" || typeof it.month !== "string" || !MONTH_RE.test(it.month)) return null;
  if (JSON.stringify(it).length > 1_500_000) return null;
  const base = emptyReport(it.month);
  const arr12 = (v: unknown): Num[] => Array.from({ length: 12 }, (_, i) => {
    const x = Array.isArray(v) ? v[i] : null;
    const n = typeof x === "string" && x.trim() !== "" ? Number(x.replace(/,/g, "")) : x;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  });
  const energy = { ...base.energy };
  for (const e of ENERGY) {
    const src = (it.energy?.[e.key] ?? {}) as Partial<EnergyData>;
    energy[e.key] = { usage: arr12(src.usage), cost: arr12(src.cost), prevUsage: arr12(src.prevUsage), prevCost: arr12(src.prevCost),
      usageNote: src.usageNote, costNote: src.costNote };
  }
  return {
    ...base,
    ...it,
    energy,
    staff: Array.isArray(it.staff) ? it.staff : [],
    holidays: Array.isArray(it.holidays) ? it.holidays.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : base.holidays,
    overrides: it.overrides && typeof it.overrides === "object" ? it.overrides : {},
    updatedAt: new Date().toISOString(),
  };
}

// 숫자 표시
export function n(v: Num | undefined, digits = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return v.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
export function pct(v: Num): string {
  return v === null ? "" : `${(v * 100).toFixed(1)}%`;
}
