// lib/billing.ts 자체점검 — node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/billing.check.mts
// 저장소가 공개라 실제 입주사·금액이 아닌 가짜 값만 쓴다.
import assert from "node:assert/strict";
import { monthItems, noTaxItems, pendingItems, splitAmount, addMonth } from "./billing.ts";
import type { BillingDoc } from "./billing.ts";

const shares = [{ name: "A", pct: 50 }, { name: "B", pct: 28 }, { name: "C", pct: 22 }];
assert.deepEqual(splitAmount(900000, shares), [450000, 252000, 198000]);
const odd = splitAmount(333333, shares);
assert.equal(odd.reduce((a, b) => a + b, 0), 333333, "끝전까지 합계가 맞는다");
assert.equal(addMonth("2026-12", 1), "2027-01");

const doc: BillingDoc = {
  shares,
  rules: [
    { id: "q", name: "분기 점검", amount: 300000, months: [3, 6, 9, 12], from: "2026-09", active: true },
    { id: "m", name: "월 점검", amount: 100000, months: [1,2,3,4,5,6,7,8,9,10,11,12], from: "2026-09", active: true },
    { id: "off", name: "끈 규칙", amount: 1, months: [10], from: "2026-01", active: false },
  ],
  items: [
    { id: "r-m-2026-09", month: "2026-09", ruleId: "m", name: "월 점검", amount: 100000, status: "billed" },
    { id: "x", month: "2026-10", name: "임시 수리", amount: 50000, status: "todo" },
  ],
};
assert.deepEqual(monthItems(doc, "2026-09").map((i) => [i.name, i.status, !!i.virtual]), [["분기 점검", "todo", true], ["월 점검", "billed", false]]);
assert.deepEqual(monthItems(doc, "2026-10").map((i) => i.name), ["월 점검", "임시 수리"], "분기 규칙은 10월에 없고, 끈 규칙도 없다");
const p = pendingItems(doc, "2026-10").map((i) => `${i.month} ${i.name}`);
assert.deepEqual(p, ["2026-09 분기 점검", "2026-10 월 점검", "2026-10 임시 수리"], "청구 완료한 9월 월 점검은 빠진다");
assert.deepEqual(noTaxItems(doc).map((i) => i.id), ["r-m-2026-09"], "청구 완료인데 세금계산서 없는 건");
assert.deepEqual(noTaxItems({ ...doc, items: doc.items.map((i) => ({ ...i, taxOn: "2026-09-30" })) }), []);
const skipped: BillingDoc = { ...doc, items: [...doc.items, { id: "r-q-2026-09", month: "2026-09", ruleId: "q", name: "분기 점검", amount: 300000, status: "todo", skip: true }] };
assert.deepEqual(monthItems(skipped, "2026-09").map((i) => i.name), ["월 점검"], "이 달만 뺀 반복 항목은 다시 생기지 않는다");
assert.ok(!pendingItems(skipped, "2026-10").some((i) => i.name === "분기 점검" && i.month === "2026-09"));
console.log("billing check ok");
