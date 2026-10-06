import { NextRequest, NextResponse } from "next/server";
import { getBilling, updateBilling } from "@/lib/store";
import { noTaxItems, normalizeItem, normalizeRule, normalizeShares, pendingItems, splitAmount } from "@/lib/billing";
import type { BillingDoc } from "@/lib/billing";

export const dynamic = "force-dynamic";

// 잠금 없음 — 업무일지와 같은 결정(docs/adr/0003). 아침 알림(obsidian-auto)이 ?pending=1 을 읽는다.
const thisMonth = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7); // KST

export async function GET(req: NextRequest) {
  const doc = await getBilling();
  if (req.nextUrl.searchParams.get("pending")) {
    const month = thisMonth();
    const pending = pendingItems(doc, month).map((i) => ({
      month: i.month, name: i.name, amount: i.amount, overdue: i.month < month,
      split: doc.shares.map((s, k) => ({ name: s.name, amount: splitAmount(i.amount, doc.shares)[k] })),
    }));
    const noTax = noTaxItems(doc).map((i) => ({ month: i.month, name: i.name, amount: i.amount }));
    return NextResponse.json({ month, pending, noTax });
  }
  return NextResponse.json(doc);
}

// 본문 { op, ... } — shares: 분담 비율 / rule·deleteRule: 반복 점검 / item·deleteItem: 그 달 청구 항목
export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const op = b?.op;
  const shares = op === "shares" ? normalizeShares(b.shares) : null;
  const rule = op === "rule" ? normalizeRule(b.rule) : null;
  const item = op === "item" ? normalizeItem(b.item) : null;
  const id = typeof b?.id === "string" ? b.id : "";
  if ((op === "shares" && !shares) || (op === "rule" && !rule) || (op === "item" && !item) ||
      (op.startsWith?.("delete") && !id) || !["shares", "rule", "deleteRule", "item", "deleteItem"].includes(op)) {
    return NextResponse.json({ error: "입력이 올바르지 않습니다." }, { status: 400 });
  }
  const doc = await updateBilling((cur): { doc: BillingDoc; result: BillingDoc } => {
    const d: BillingDoc = { shares: cur.shares, rules: [...cur.rules], items: [...cur.items] };
    if (shares) d.shares = shares;
    if (rule) d.rules = [...d.rules.filter((r) => r.id !== rule.id), rule];
    if (op === "deleteRule") d.rules = d.rules.filter((r) => r.id !== id);
    if (item) d.items = [...d.items.filter((i) => i.id !== item.id), item];
    if (op === "deleteItem") d.items = d.items.filter((i) => i.id !== id);
    return { doc: d, result: d };
  });
  return NextResponse.json(doc);
}
