// 실비 청구 — 점검비 등 입주사에 나눠 청구할 금액을 달마다 빠짐없이 챙긴다. 타입과 I/O 없는 순수 계산.
// 저장은 lib/store.ts(billing), 화면은 app/billing/page.tsx, 아침 알림은 obsidian-auto 가 /api/billing?pending=1 을 읽는다.
//
// 반복 점검(규칙)을 한 번 등록하면 해당 달마다 청구 항목이 「청구 전」으로 생긴다(실제로 고치기 전까지는 계산만 한 가상 항목).
// 입주사 이름·분담 비율은 공개 저장소에 두지 않으려고 코드가 아니라 저장소 데이터(shares)에만 둔다.

export type Share = { name: string; pct: number };
export type BillingStatus = "todo" | "billed" | "paid";
export const STATUS_LABEL: Record<BillingStatus, string> = { todo: "청구 전", billed: "청구 완료", paid: "입금 확인" };

export type BillingRule = {
  id: string;
  name: string;        // 점검·작업 이름
  vendor?: string;
  amount: number;      // 원, VAT 별도
  months: number[];    // 청구하는 달 1~12
  from: string;        // 시작 달 YYYY-MM
  until?: string;      // 끝 달 (계약 종료)
  active: boolean;
  note?: string;
};

export type BillingItem = {
  id: string;
  month: string;       // 청구 대상 달 YYYY-MM
  ruleId?: string;     // 반복 점검에서 온 항목
  name: string;
  vendor?: string;
  amount: number;
  inspectedOn?: string;
  status: BillingStatus;
  billedOn?: string;
  paidOn?: string;
  taxOn?: string;      // 세금계산서 발행일 (없으면 미발행)
  skip?: boolean;      // 반복 항목을 이 달만 뺌 (삭제) — 규칙은 그대로
  note?: string;
  virtual?: boolean;   // 규칙에서 계산만 된 항목(아직 저장 안 됨)
  updatedAt?: string;
};

export type BillingDoc = { shares: Share[]; rules: BillingRule[]; items: BillingItem[] };
export const EMPTY_DOC: BillingDoc = { shares: [], rules: [], items: [] };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 금액을 비율대로 나눈다 — 원 단위 반올림, 비율 합이 100%면 끝전은 가장 큰 몫에 붙여 합계를 맞춘다 */
export function splitAmount(total: number, shares: Share[]): number[] {
  const out = shares.map((s) => Math.round((total * s.pct) / 100));
  if (shares.length && Math.abs(shares.reduce((a, s) => a + s.pct, 0) - 100) < 1e-9) {
    const big = shares.reduce((bi, s, i) => (s.pct > shares[bi].pct ? i : bi), 0);
    out[big] += total - out.reduce((a, n) => a + n, 0);
  }
  return out;
}

export function addMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const ruleHits = (r: BillingRule, month: string) =>
  r.active && r.months.includes(Number(month.slice(5))) && r.from <= month && (!r.until || month <= r.until);

/** 그 달의 청구 항목 — 저장된 항목 + 규칙에서 나온(아직 저장 안 한) 항목 */
export function monthItems(doc: BillingDoc, month: string): BillingItem[] {
  const saved = doc.items.filter((i) => i.month === month);
  const virtual = doc.rules
    .filter((r) => ruleHits(r, month) && !saved.some((i) => i.ruleId === r.id))
    .map((r): BillingItem => ({ id: `r-${r.id}-${month}`, month, ruleId: r.id, name: r.name, vendor: r.vendor, amount: r.amount, status: "todo", virtual: true }));
  return [...saved.filter((i) => !i.skip), ...virtual].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** 청구는 했는데 세금계산서를 아직 발행하지 않은 항목 */
export function noTaxItems(doc: BillingDoc): BillingItem[] {
  return doc.items.filter((i) => !i.skip && i.status !== "todo" && !i.taxOn && i.amount > 0).sort((a, b) => a.month.localeCompare(b.month));
}

/** 이번 달까지 아직 청구하지 않은 항목 (오래된 달부터) */
export function pendingItems(doc: BillingDoc, thisMonth: string): BillingItem[] {
  const starts = [...doc.rules.map((r) => r.from), ...doc.items.map((i) => i.month)].filter((m) => MONTH_RE.test(m)).sort();
  if (!starts.length) return [];
  const out: BillingItem[] = [];
  for (let m = starts[0]; m <= thisMonth; m = addMonth(m, 1)) out.push(...monthItems(doc, m).filter((i) => i.status === "todo"));
  return out;
}

// ── 입력 검증 (API) ──────────────────────────────────────────────
const text = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const money = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

export function normalizeShares(v: unknown): Share[] | null {
  if (!Array.isArray(v) || v.length > 10) return null;
  const out = v.map((s) => ({ name: text((s as Share)?.name, 40) ?? "", pct: Number((s as Share)?.pct) })).filter((s) => s.name);
  return out.every((s) => Number.isFinite(s.pct) && s.pct >= 0 && s.pct <= 100) ? out : null;
}

export function normalizeRule(v: unknown): BillingRule | null {
  const r = (v ?? {}) as Record<string, unknown>;
  const name = text(r.name);
  const from = typeof r.from === "string" && MONTH_RE.test(r.from) ? r.from : null;
  const months = Array.isArray(r.months) ? [...new Set(r.months.map(Number).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b) : [];
  if (!name || !from || !months.length) return null;
  const until = typeof r.until === "string" && MONTH_RE.test(r.until) ? r.until : undefined;
  return { id: text(r.id, 60) ?? crypto.randomUUID(), name, vendor: text(r.vendor), amount: money(r.amount), months, from, until, active: r.active !== false, note: text(r.note, 500) };
}

export function normalizeItem(v: unknown): BillingItem | null {
  const r = (v ?? {}) as Record<string, unknown>;
  const name = text(r.name);
  const month = typeof r.month === "string" && MONTH_RE.test(r.month) ? r.month : null;
  if (!name || !month) return null;
  const date = (x: unknown) => (typeof x === "string" && DATE_RE.test(x) ? x : undefined);
  const status: BillingStatus = r.status === "billed" || r.status === "paid" ? r.status : "todo";
  // 규칙에서 온 가상 항목은 저장할 때 고정 id 로 (같은 달·규칙이 두 번 생기지 않게)
  const id = typeof r.ruleId === "string" ? `r-${r.ruleId}-${month}` : text(r.id, 80) ?? crypto.randomUUID();
  return {
    id, month, ruleId: text(r.ruleId, 60), name, vendor: text(r.vendor), amount: money(r.amount),
    inspectedOn: date(r.inspectedOn), status, billedOn: date(r.billedOn), paidOn: date(r.paidOn), taxOn: date(r.taxOn), skip: r.skip === true || undefined, note: text(r.note, 500),
    updatedAt: new Date().toISOString(),
  };
}
