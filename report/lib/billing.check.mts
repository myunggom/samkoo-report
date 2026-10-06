// lib/billing.ts 자체점검 — node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/billing.check.mts
// 저장소가 공개라 실제 입주사·금액이 아닌 가짜 값만 쓴다.
import assert from "node:assert/strict";
import { monthItems, pendingItems, splitAmount, addMonth } from "./billing.ts";
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
console.log("billing check ok");
