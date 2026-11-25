// 공조기(AHU) 가동 스케줄 — 바이오 이노베이션 허브 34대.
//
// 왜 「판(version)」으로 쌓나
//   사장 요청(2026-11-25): "나중에 아 그 시점에는 그 값으로 운영했구나 라고 기록을 남기고 싶다".
//   그래서 고칠 때마다 덮어쓰지 않고 「적용일부터 쓰는 전체 스케줄 한 벌」을 새로 쌓는다.
//   어떤 날짜의 스케줄 = 적용일이 그날 이전인 판 중 가장 늦은 것.
//
// 호기 · 층 · 구역은 준공도서 「21-공조기별 조닝도」(PDF 낱장 38장)에서 옮겼다.
// 도면 그림은 public/hvac/<호기>-<장>.webp (오른쪽 표제란은 잘라냄).

export type HvacMode = "" | "냉방" | "난방" | "송풍" | "정지";
export const HVAC_MODES: HvacMode[] = ["냉방", "난방", "송풍", "정지"];
export const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

export type AhuUnit = {
  id: string;          // "C01"
  floor: string;       // "B1" | "1F" ...
  tenant: "공용" | "프로젠" | "제넥신" | "셀리드";
  zone: string;        // 담당 구역
  sheets: number;      // 조닝도 장 수
};

// 한 호기의 운전 설정
// 2026-11-25 사장 : 모드 · 설정온도는 필수. 급기팬 · 환기팬 Hz(기본 50), 엔탈피 모드(봄 · 가을),
// 댐퍼 개도(0~100%)도 남긴다. 고객사에 보낼 설정값 표(PPT 한 장)에 그대로 나간다.
export type UnitSetting = {
  mode: HvacMode;
  temp: number | null;  // 설정온도 ℃
  supplyHz: number;     // 급기팬 Hz
  exhaustHz: number;    // 환기팬 Hz
  enthalpy: boolean;    // 엔탈피 제어 사용 (봄 · 가을)
  damper: number | null; // 댐퍼 개도 %
  days: boolean[];      // 월~일 7칸
  start: string;        // "11:00"
  end: string;          // "14:00"
};
export const DEFAULT_HZ = 50;

export type HvacVersion = {
  id: string;
  effectiveFrom: string;               // 적용일 YYYY-MM-DD
  savedAt: string;                     // 저장 시각 ISO
  by: string;                          // 수정자
  reason: string;                      // 변경 사유
  settings: Record<string, UnitSetting>;
};

const U = (id: string, floor: string, tenant: AhuUnit["tenant"], zone: string, sheets = 1): AhuUnit =>
  ({ id, floor, tenant, zone, sheets });

export const AHU_UNITS: AhuUnit[] = [
  U("C01", "B1", "공용", "지하1층 공용부"),
  U("C02", "1F", "공용", "1층 서측 공용부"),
  U("C03", "1F", "공용", "1층 서측 공용부"),
  U("C04", "1F", "공용", "1층 동측 공용부"),
  U("C05", "1F", "공용", "1층 동측 공용부"),
  U("C06", "1F", "공용", "1층 동측 공용부"),
  U("L21", "2F", "제넥신", "2층 실험실"),
  U("R31", "2~3F", "셀리드", "2~3층 사무실 · 실험실", 2),
  U("L31", "2~3F", "셀리드", "2~3층 사무실 · 실험실", 2),
  U("R32", "2~3F", "제넥신", "2~3층 실험실", 2),
  U("L32", "2~3F", "제넥신", "2~3층 실험실", 2),
  U("R41", "4F", "셀리드", "4층 사무실 · 실험실 · 서버실"),
  U("L41", "4F", "셀리드", "4층 사무실 · 실험실 · 서버실"),
  U("R42", "4F", "제넥신", "4층 실험실"),
  U("L42", "4F", "제넥신", "4층 실험실"),
  U("R51", "5F", "셀리드", "5층 사무실"),
  U("R52", "5F", "제넥신", "5층 실험실 · 사무실"),
  U("L51", "5F", "제넥신", "5층 실험실 · 사무실"),
  U("L61", "6F", "프로젠", "6층 실험실-1"),
  U("L62", "6F", "프로젠", "6층 실험실-2"),
  U("R61", "6F", "제넥신", "6층 연구실 · 사무실"),
  U("R62", "6F", "제넥신", "6층 연구실 · 사무실"),
  U("L71", "7F", "프로젠", "7층 실험실"),
  U("L72", "7F", "프로젠", "7층 실험실"),
  U("L73", "7F", "프로젠", "7층 실험실"),
  U("L74", "7F", "프로젠", "7층 실험실"),
  U("L81", "8F", "프로젠", "8층 실험실"),
  U("L82", "8F", "프로젠", "8층 실험실"),
  U("L83", "8F", "프로젠", "8층 실험실"),
  U("L84", "8F", "프로젠", "8층 실험실"),
  U("R91", "9F", "프로젠", "9층 실험실 · 사무실"),
  U("L91", "9F", "프로젠", "9층 실험실 · 사무실"),
  U("R92", "9F", "프로젠", "9층 개인실 · 사무실 · 전산실"),
  U("R93", "9F", "프로젠", "9층 개인실 · 사무실 · 전산실"),
];

export const TENANTS = ["공용", "프로젠", "제넥신", "셀리드"] as const;

export function sheetUrls(u: AhuUnit): string[] {
  return Array.from({ length: u.sheets }, (_, i) => `/hvac/${u.id}-${i + 1}.webp`);
}

// 처음 판이 없을 때 보여 줄 값 — 2026년 하절기 보고 때의 「매일 11:00~14:00」.
// 모드 · 설정온도는 기록이 없어 비워 둔다(기계과장이 첫 저장 때 채운다).
export function defaultSetting(): UnitSetting {
  return { mode: "", temp: null, supplyHz: DEFAULT_HZ, exhaustHz: DEFAULT_HZ, enthalpy: false, damper: null,
           days: [true, true, true, true, true, true, true], start: "11:00", end: "14:00" };
}
export function defaultSettings(): Record<string, UnitSetting> {
  return Object.fromEntries(AHU_UNITS.map((u) => [u.id, defaultSetting()]));
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 서버에서 받은 값을 믿지 않고 모양을 맞춘다
export function cleanSetting(x: unknown): UnitSetting {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const d = defaultSetting();
  const mode = HVAC_MODES.includes(o.mode as HvacMode) ? (o.mode as HvacMode) : "";
  const t = o.temp === null || o.temp === "" || o.temp === undefined ? null : Number(o.temp);
  const temp = t !== null && Number.isFinite(t) && t >= 5 && t <= 40 ? Math.round(t * 10) / 10 : null;
  const num = (v: unknown, lo: number, hi: number, step: number): number | null => {
    if (v === null || v === "" || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n / step) * step : null;
  };
  const supplyHz = num(o.supplyHz, 0, 60, 0.1) ?? d.supplyHz;
  const exhaustHz = num(o.exhaustHz, 0, 60, 0.1) ?? d.exhaustHz;
  const damper = num(o.damper, 0, 100, 1);
  const enthalpy = o.enthalpy === true;
  const days = Array.isArray(o.days) && o.days.length === 7 ? o.days.map(Boolean) : d.days;
  const start = typeof o.start === "string" && TIME_RE.test(o.start) ? o.start : d.start;
  const end = typeof o.end === "string" && TIME_RE.test(o.end) ? o.end : d.end;
  return { mode, temp, supplyHz: Math.round(supplyHz * 10) / 10, exhaustHz: Math.round(exhaustHz * 10) / 10,
           enthalpy, damper, days, start, end };
}

// 저장 전에 빠진 필수값 — 모드는 모두, 설정온도는 정지가 아닌 호기만
export function missingRequired(settings: Record<string, UnitSetting>): string[] {
  return AHU_UNITS.filter((u) => {
    const s = settings[u.id];
    return !s || !s.mode || (s.mode !== "정지" && s.temp == null);
  }).map((u) => u.id);
}

export function daysText(days: boolean[]): string {
  return days.every(Boolean) ? "매일"
    : days.slice(0, 5).every(Boolean) && !days[5] && !days[6] ? "평일"
    : days.every((x) => !x) ? "가동 없음"
    : DAY_LABELS.filter((_, i) => days[i]).join("·");
}
export function isDate(s: unknown): s is string {
  return typeof s === "string" && DATE_RE.test(s);
}

// 그날 적용되던 판 (없으면 null)
export function versionAt(versions: HvacVersion[], date: string): HvacVersion | null {
  let best: HvacVersion | null = null;
  for (const v of versions) {
    if (v.effectiveFrom > date) continue;
    if (!best || v.effectiveFrom > best.effectiveFrom ||
        (v.effectiveFrom === best.effectiveFrom && v.savedAt > best.savedAt)) best = v;
  }
  return best;
}

export function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function settingText(s: UnitSetting): string {
  return [s.mode || "모드 미입력", s.temp != null ? `${s.temp}℃` : "",
    `급기 ${s.supplyHz}Hz`, `환기 ${s.exhaustHz}Hz`, s.enthalpy ? "엔탈피" : "",
    s.damper != null ? `댐퍼 ${s.damper}%` : "",
    s.mode === "정지" ? "" : `${daysText(s.days)} ${s.start}~${s.end}`]
    .filter(Boolean).join(" · ");
}

// 두 판 사이에서 바뀐 호기와 내용
export function diffSettings(a: Record<string, UnitSetting> | null, b: Record<string, UnitSetting>): { id: string; from: string; to: string }[] {
  const out: { id: string; from: string; to: string }[] = [];
  for (const u of AHU_UNITS) {
    const to = settingText(b[u.id] ?? defaultSetting());
    const from = a ? settingText(a[u.id] ?? defaultSetting()) : "";
    if (from !== to) out.push({ id: u.id, from, to });
  }
  return out;
}
