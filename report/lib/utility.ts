// 수도광열비 — 원격검침 자료(.xls) 읽기·항목 판별·보정·검증. I/O 없는 순수 계산 (브라우저·node 공통).
// 회입분 엑셀 채우기는 lib/utilityXlsx.ts, 화면은 app/utility/page.tsx, 저장은 lib/store.ts(utility).
// 근거: 수도광열비_자동화_인수인계.md (2026-10-20). 입주사 이름·비율은 공개 저장소에 두지 않는다 — 회입분 양식(엑셀)과 저장소 데이터에만.

export type Kind = "전기" | "열" | "수도" | "중수";
export const KINDS: Kind[] = ["전기", "열", "수도", "중수"];

/** 검침자료의 묶음 — 전기형은 「전기」 하나, 물형은 다섯 묶음이 같은 칸 배치 */
export type Group = "전기" | "수도" | "온수" | "가스" | "환탕" | "냉난방";
const WATER_GROUPS: [Group, number][] = [["수도", 3], ["온수", 6], ["가스", 9], ["환탕", 12], ["냉난방", 15]];

export type Val = number | "-";
export type Reading = { s: Val; e: Val; u: Val };
export type Meter = { no: number; dong: string; name: string; ct?: number; g: Partial<Record<Group, Reading>> };
export type Feed = { file: string; from: string; to: string; electric: boolean; meters: Meter[] };

/** 보정표 — 보정.txt 대신. 계량률(rate)이 있으면 사용량을 역산해 종료지침을 다시 만든다 */
export type Fix = { kind: Kind; meter: string; rate?: number; start?: number; end?: number; group?: Group; reason: string };

export type Check = { level: "오류" | "경고" | "확인"; kind: Kind | "공통"; text: string; detail?: string[] };

// ── 검침자료 파일 (확장자는 .xls 지만 SpreadsheetML 2003 XML, 끝에 널 바이트) ─────────────────
const unent = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&");
const num = (v: string | undefined): Val => {
  const t = (v ?? "").trim();
  if (t === "" || t === "-") return "-";
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : "-";
};

export function parseFeed(text: string, file = ""): Feed {
  const xml = text.replace(/\u0000/g, "").trim();
  const name = xml.match(/<(?:ss:)?Worksheet[^>]*?ss:Name="([^"]+)"/)?.[1];
  const p = name?.match(/(\d{4})\.(\d{2})\.(\d{2})\.\d{2}\s*[∼~]\s*(\d{4})\.(\d{2})\.(\d{2})/);
  if (!p) throw new Error(`${file || "파일"}: 원격검침 기간별 자료가 아닙니다 (시트 이름에 기간이 없음)`);
  const rows: Record<number, string>[] = [];
  for (const r of xml.matchAll(/<(?:ss:)?Row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:ss:)?Row>)/g)) {
    const row: Record<number, string> = {};
    let col = 0;
    for (const c of (r[1] ?? "").matchAll(/<(?:ss:)?Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:ss:)?Cell>)/g)) {
      const idx = c[1].match(/ss:Index="(\d+)"/);
      if (idx) col = +idx[1] - 1;
      const d = c[2]?.match(/<(?:ss:)?Data\b[^>]*>([\s\S]*?)<\/(?:ss:)?Data>/);
      row[col] = d ? unent(d[1].replace(/<[^>]+>/g, "")) : "";
      col += 1 + Number(c[1].match(/ss:MergeAcross="(\d+)"/)?.[1] ?? 0);
    }
    rows.push(row);
  }
  const head = rows.find((r) => r[0] === "NO") ?? {};
  const electric = (head[3] ?? "").includes("전기");
  const meters: Meter[] = rows.filter((r) => /^\d+$/.test((r[0] ?? "").trim())).map((r) => {
    const m: Meter = { no: +r[0], dong: (r[1] ?? "").trim(), name: (r[2] ?? "").trim(), g: {} };
    if (electric) {
      m.ct = Number(r[5]) || 1;
      m.g.전기 = { s: num(r[3]), e: num(r[4]), u: num(r[6]) };
    } else for (const [g, i] of WATER_GROUPS) m.g[g] = { s: num(r[i]), e: num(r[i + 1]), u: num(r[i + 2]) };
    return m;
  });
  return { file, from: `${p[1]}-${p[2]}-${p[3]}`, to: `${p[4]}-${p[5]}-${p[6]}`, electric, meters };
}

// ── 항목 판별·기간 ───────────────────────────────────────────────
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const lastDay = (ym: string) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
export const addMonth = (ym: string, n: number) => {
  const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** 파일명은 달마다 달라(전기/E/설비…) 믿지 않는다 — 머리글과 기간 모양으로 가른다 */
export function classify(f: Feed): Kind {
  if (f.electric) return "전기";
  if (dayDiff(f.from, f.to) > 45) return "중수";
  if (f.from.endsWith("-01") && +f.to.slice(8) === lastDay(f.to.slice(0, 7)) && f.from.slice(0, 7) === f.to.slice(0, 7)) return "열";
  return "수도";
}

/** 이 자료가 몇 월 사용분인지 — 전기·열은 시작 달, 수도·중수는 끝 달 */
export const usageMonth = (kind: Kind, f: Feed) => (kind === "전기" || kind === "열" ? f.from : f.to).slice(0, 7);

/** 그 사용월에 와야 하는 검침 기간 (회입분 작성방법!B7 수식과 같은 규칙) */
export function expectedPeriod(kind: Kind, month: string): { from: string; to: string } {
  const prev = addMonth(month, -1), next = addMonth(month, 1);
  if (kind === "전기") return { from: `${month}-10`, to: `${next}-09` };
  if (kind === "열") return { from: `${month}-01`, to: `${month}-${lastDay(month)}` };
  if (kind === "수도") return { from: `${prev}-25`, to: `${month}-24` };
  return { from: `${prev}-01`, to: `${month}-${lastDay(month)}` };
}

// ── 보정 ─────────────────────────────────────────────────────────
const norm = (s: string) => s.replace(/\s+/g, "").replace(/^지하/, "B");
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 보정표를 그 항목 계량기에 적용한 사본. rate: 사용량÷계량률 만큼 종료지침을 다시 만든다 */
export function applyFixes(kind: Kind, meters: Meter[], fixes: Fix[]): { meters: Meter[]; applied: string[] } {
  const applied: string[] = [];
  const out = meters.map((m) => {
    const mine = fixes.filter((f) => f.kind === kind && norm(f.meter) === norm(m.name));
    if (!mine.length) return m;
    const g = { ...m.g };
    for (const f of mine) {
      const key: Group = f.group ?? (kind === "전기" ? "전기" : kind === "열" ? "냉난방" : "수도");
      const r = g[key];
      if (!r) continue;
      let { s, e } = r;
      if (f.start !== undefined) s = f.start;
      if (f.end !== undefined) e = f.end;
      if (f.rate && typeof s === "number" && typeof r.u === "number") e = round2(s + r.u / f.rate);
      const u: Val = typeof s === "number" && typeof e === "number" ? round2(e - s) : r.u;
      g[key] = { s, e, u };
      applied.push(`${m.no}. ${m.name} ${key} ${r.s}→${r.e} 를 ${s}→${e} 로 (${f.reason})`);
    }
    return { ...m, g };
  });
  return { meters: out, applied };
}

/** 보정표 글(보정.txt 형식)을 읽는다 — 항목 | 계량기명 | 시작지침 | 종료지침 | 묶음 */
export function parseFixText(text: string): Fix[] {
  const out: Fix[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const [k, meter, a = "", b = "", g = ""] = line.split("|").map((x) => x.trim());
    if (!KINDS.includes(k as Kind) || !meter) continue;
    const rate = a.match(/계량률\s*([\d.]+)\s*%/);
    const f: Fix = { kind: k as Kind, meter, reason: rate ? `계량률 ${rate[1]}%` : "값 직접 지정" };
    if (rate) f.rate = +rate[1] / 100;
    else {
      if (a && Number.isFinite(+a)) f.start = +a;
      if (b && Number.isFinite(+b)) f.end = +b;
    }
    if (g === "온수" || g === "환수") f.group = g === "온수" ? "온수" : "환탕";
    out.push(f);
  }
  return out;
}

// ── 검증 ─────────────────────────────────────────────────────────
/** 회입분 양식에서 읽어 온 계량기 한 줄 (번호·이름·사용처 표시) */
export type TplMeter = { no: number; name: string; tag: string };

/** 원격검침 합계 — 회입분 수식과 같은 계량기만 센다 */
export function meterTotal(kind: Kind, meters: Meter[], tpl: TplMeter[]): number | null {
  const tag = new Map(tpl.map((t) => [t.no, t.tag]));
  const u = (r?: Reading) => (r && typeof r.s === "number" && typeof r.e === "number" ? r.e - r.s : 0);
  // 전기: (당월−전월)×CT 합. 회입분은 메인 차단기에서 분기 사용량을 빼는 표(원격검침 DB T~Y열)를 거쳐 더 작아진다 — 화면 값은 그 차감 전(상한)
  if (kind === "전기") return round2(meters.reduce((a, m) => a + u(m.g.전기) * (m.ct ?? 1), 0));
  if (kind === "열") return round2(meters.reduce((a, m) => a + ((tag.get(m.no) ?? "").includes("확인용") ? 0 : u(m.g.냉난방)), 0));
  if (kind === "중수") return round2(meters.reduce((a, m) => a + ((tag.get(m.no) ?? "").includes("[중수]") ? u(m.g.수도) : 0), 0));
  return null; // 수도: 회입분이 입주사 전용부만 더해 공용부를 미검침분으로 둔다 — 엑셀에서 확인
}

/** 고지서 사용량 — 회입분 수식 그대로 (전기 고지서!F21=SUM(F15:G20), 열 K16, 수도 K21, 중수 K15) */
export function billUsage(kind: Kind, v: (ref: string) => number): number {
  if (kind === "전기") return ["F15", "F16", "F17", "F18", "F19", "F20", "G15", "G16", "G17", "G18", "G19", "G20"].reduce((a, r) => a + v(`고지서!${r}`), 0);
  if (kind === "열") return round2(v("고지서!F16") - v("고지서!E16") + v("고지서!I16") - v("고지서!H16"));
  if (kind === "수도") return v("고지서!K17") - v("고지서!K19");
  return v("고지서!K15");
}

export type CheckInput = {
  kind: Kind; month: string; feed: Feed; meters: Meter[]; tpl: TplMeter[];
  bill: (ref: string) => number; prev?: Record<number, number>; lastYear?: Record<number, number>;
};

const GROUPS_OF: Record<Kind, Group[]> = { 전기: ["전기"], 열: ["냉난방"], 수도: ["수도", "온수", "환탕"], 중수: ["수도"] };
const fmt = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });

export function runChecks(x: CheckInput): Check[] {
  const out: Check[] = [];
  const { kind } = x;
  const exp = expectedPeriod(kind, x.month);
  if (exp.from !== x.feed.from || exp.to !== x.feed.to) {
    out.push({ level: "경고", kind, text: `검침 기간이 ${x.feed.from} ~ ${x.feed.to} 입니다. ${x.month} 사용분은 ${exp.from} ~ ${exp.to} 이어야 합니다.` });
  }
  // 역행 — 계기 교체·고장
  const back = x.meters.flatMap((m) => GROUPS_OF[kind].flatMap((g) => {
    const r = m.g[g];
    return r && typeof r.s === "number" && typeof r.e === "number" && r.e < r.s ? [`${m.no}. ${m.name} ${g} ${r.s} → ${r.e}`] : [];
  }));
  if (back.length) out.push({ level: "오류", kind, text: `검침값이 거꾸로 간 계량기 ${back.length}개 (계기 교체·고장 확인)`, detail: back });

  // 계량기 목록 불일치
  if (x.tpl.length) {
    const fno = new Set(x.meters.map((m) => m.no)), tno = new Set(x.tpl.map((t) => t.no));
    const onlyFeed = x.meters.filter((m) => !tno.has(m.no)).map((m) => `${m.no}. ${m.name}`);
    const onlyTpl = x.tpl.filter((t) => !fno.has(t.no)).map((t) => `${t.no}. ${t.name}`);
    if (onlyFeed.length) out.push({ level: "경고", kind, text: `검침자료에만 있는 계량기 ${onlyFeed.length}개 (회입분에 칸 없음)`, detail: onlyFeed });
    if (onlyTpl.length) out.push({ level: "경고", kind, text: `회입분에만 있는 계량기 ${onlyTpl.length}개 (검침자료에 없음)`, detail: onlyTpl });
  }

  // 미검침분
  const total = meterTotal(kind, x.meters, x.tpl);
  const bill = billUsage(kind, x.bill);
  if (total === null) out.push({ level: "확인", kind, text: "미검침분은 회입분 엑셀(작성방법!J9)에서 확인하세요 — 공용부를 미검침분으로 두는 방식이라 화면에서 계산하지 않습니다." });
  else if (bill <= 0) out.push({ level: "확인", kind, text: "③에 이번 달 고지서 사용량(지침)을 넣으면 미검침분을 계산합니다." });
  else {
    const solar = kind === "전기" ? x.bill("작성방법!J18") : 0;
    const miss = round2(bill + solar - total);
    const rate = miss / (bill + solar);
    const label = kind === "전기" ? `한전 ${fmt(bill)} + 태양광 ${fmt(solar)} − 원격검침 ${fmt(total)}` : `고지서 ${fmt(bill)} − 원격검침 ${fmt(total)}`;
    if (miss < 0 && kind === "전기") out.push({ level: "경고", kind, text: `화면 계산 미검침분 ${fmt(miss)} (${label}) — 메인·분기 중복을 빼기 전 값이라 실제보다 작게 나옵니다. 회입분 엑셀 작성방법!J20 이 양수인지 확인하세요.` });
    else if (miss < 0) out.push({ level: "오류", kind, text: `미검침분이 음수입니다: ${label} = ${fmt(miss)}. 원격검침 합계가 고지서보다 큽니다 (계기 오류·중복 집계 확인)` });
    else if (rate > 0.5) out.push({ level: "경고", kind, text: `미검침률 ${(rate * 100).toFixed(0)}% — 평소보다 큽니다: ${label} = ${fmt(miss)}` });
    else out.push({ level: "확인", kind, text: `미검침분 ${fmt(miss)} (${(rate * 100).toFixed(1)}%): ${label}` });
  }

  // 지난달 대비 — 사용하던 계량기가 멈춤 / 전년 동월 3배 급증
  const usage = meterUsage(kind, x.meters);
  const nameOf = (no: string) => x.meters.find((m) => m.no === +no)?.name ?? "";
  if (x.prev) {
    const stop = Object.entries(usage).filter(([no, u]) => u === 0 && (x.prev![+no] ?? 0) > 0).map(([no]) => `${no}. ${nameOf(no)} (지난달 ${x.prev![+no]})`);
    if (stop.length) out.push({ level: "경고", kind, text: `지난달엔 쓰다가 이번 달 0인 계량기 ${stop.length}개 (통신 끊김 의심)`, detail: stop });
  }
  if (x.lastYear) {
    const jump = Object.entries(usage).filter(([no, u]) => (x.lastYear![+no] ?? 0) > 0 && u > 3 * x.lastYear![+no]).map(([no, u]) => `${no}. ${nameOf(no)} ${u} (전년 ${x.lastYear![+no]})`);
    if (jump.length) out.push({ level: "경고", kind, text: `전년 같은 달의 3배가 넘는 계량기 ${jump.length}개 (누수 의심)`, detail: jump });
  }
  return out;
}

/** 계량기별 사용량 — 다음 달·내년 비교용으로 저장 */
export function meterUsage(kind: Kind, meters: Meter[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const m of meters) {
    const r = m.g[GROUPS_OF[kind][0]];
    if (r && typeof r.s === "number" && typeof r.e === "number") out[m.no] = round2((r.e - r.s) * (kind === "전기" ? m.ct ?? 1 : 1));
  }
  return out;
}

// ── 저장 문서 ────────────────────────────────────────────────────
export type FeedRef = { kind: Kind; file: string; url: string; from: string; to: string };
export type Template = { url: string; name: string; month: string };
export type MonthData = {
  feeds: FeedRef[];
  inputs: Partial<Record<Kind, Record<string, number | string>>>; // "고지서!F15": 21721
  usage?: Partial<Record<Kind, Record<number, number>>>; // 계량기별 사용량 (다음 달 비교용)
  done?: Partial<Record<Kind, string>>; // 회입분 만든 시각
  blank?: Partial<Record<Kind, boolean>>; // 이번 달은 검침값 대신 면적지분율로 배분 (원격검침 칸 비움)
  updatedAt?: string;
};
export type UtilityDoc = { fixes: Fix[]; templates: Partial<Record<Kind | "종합", Template>>; months: Record<string, MonthData> };
export const EMPTY_UTILITY: UtilityDoc = { fixes: [], templates: {}, months: {} };

// ── 입력 검증 (API) ──────────────────────────────────────────────
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const isKind = (k: unknown): k is Kind => KINDS.includes(k as Kind);
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const isUrl = (v: unknown) => typeof v === "string" && /^https:\/\/[\w.-]+\.vercel-storage\.com\//.test(v);

export function normalizeFixes(v: unknown): Fix[] | null {
  if (!Array.isArray(v) || v.length > 100) return null;
  const out: Fix[] = [];
  for (const x of v as Record<string, unknown>[]) {
    if (!isKind(x?.kind) || !str(x.meter) || !str(x.reason)) return null; // 사유 필수
    const f: Fix = { kind: x.kind, meter: str(x.meter, 100), reason: str(x.reason, 200) };
    for (const k of ["rate", "start", "end"] as const) if (typeof x[k] === "number" && Number.isFinite(x[k])) f[k] = x[k] as number;
    if (f.rate !== undefined && !(f.rate > 0 && f.rate <= 1)) return null;
    if (x.group === "온수" || x.group === "환탕") f.group = x.group;
    out.push(f);
  }
  return out;
}

export function normalizeMonth(month: unknown, v: unknown): MonthData | null {
  if (typeof month !== "string" || !MONTH_RE.test(month)) return null;
  const d = (v ?? {}) as Record<string, unknown>;
  const feeds: FeedRef[] = [];
  for (const f of (Array.isArray(d.feeds) ? d.feeds : []).slice(0, 12) as Record<string, unknown>[]) {
    if (!isKind(f?.kind) || !isUrl(f.url)) return null;
    feeds.push({ kind: f.kind, file: str(f.file, 200), url: f.url as string, from: str(f.from, 10), to: str(f.to, 10) });
  }
  const inputs: MonthData["inputs"] = {};
  for (const [k, rec] of Object.entries((d.inputs ?? {}) as Record<string, unknown>)) {
    if (!isKind(k) || typeof rec !== "object" || !rec) return null;
    inputs[k] = Object.fromEntries(Object.entries(rec as Record<string, unknown>).filter(([ref, val]) =>
      /^[^!]{1,40}![A-Z]{1,3}\d{1,4}$/.test(ref) && (typeof val === "number" ? Number.isFinite(val) : typeof val === "string" && val.length < 200)).slice(0, 200)) as Record<string, number | string>;
  }
  const usage: MonthData["usage"] = {};
  for (const [k, rec] of Object.entries((d.usage ?? {}) as Record<string, unknown>)) {
    if (!isKind(k) || typeof rec !== "object" || !rec) continue;
    usage[k] = Object.fromEntries(Object.entries(rec as Record<string, unknown>).filter(([no, u]) => /^\d{1,4}$/.test(no) && typeof u === "number" && Number.isFinite(u)).slice(0, 400)) as Record<number, number>;
  }
  const done: MonthData["done"] = {};
  for (const [k, t] of Object.entries((d.done ?? {}) as Record<string, unknown>)) if (isKind(k) && typeof t === "string") done[k] = t.slice(0, 30);
  const blank: MonthData["blank"] = {};
  for (const [k, b] of Object.entries((d.blank ?? {}) as Record<string, unknown>)) if (isKind(k) && b === true) blank[k] = true;
  return { feeds, inputs, usage, done, blank, updatedAt: new Date().toISOString() };
}

export function normalizeTemplate(kind: unknown, t: unknown): { kind: Kind | "종합"; t: Template } | null {
  const x = (t ?? {}) as Record<string, unknown>;
  if (!(isKind(kind) || kind === "종합") || !isUrl(x.url) || typeof x.month !== "string" || !MONTH_RE.test(x.month)) return null;
  return { kind, t: { url: x.url as string, name: str(x.name, 200), month: x.month } };
}
