// lib/utility.ts 자체점검 — node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/utility.check.mts
// 공개 저장소라 가짜 계량기·가짜 값만 쓴다. 실제 8월 자료 전수 대조는 2026-10-20 로컬에서 함(전기·열 0칸 차이).
import assert from "node:assert/strict";
import { applyFixes, classify, expectedPeriod, meterTotal, parseFeed, parseFixText, runChecks, usageMonth } from "./utility.ts";

const row = (cells: string[]) => `<Row>${cells.map((c, i) => (c === "" ? "" : `<Cell ss:Index="${i + 1}"><Data ss:Type="String">${c}</Data></Cell>`)).join("")}</Row>`;
const water = (period: string, rows: string[][]) => `<?xml version="1.0"?><Workbook xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${period}"><Table>` +
  row(["■ 그룹별"]) + row(["NO", "동", "호", "수도/중수", "", "", "온수", "", "", "가스", "", "", "환탕", "", "", "냉난방"]) + rows.map(row).join("") + `</Table></Worksheet></Workbook>\u0000\u0000`;
const m = (no: number, name: string, s: string, e: string, u: string, heat = ["-", "-", "-"]) => [String(no), "공용", name, s, e, u, "-", "-", "-", "-", "-", "-", "-", "-", "-", ...heat];

const sudo = parseFeed(water("2026.07.25.00 ∼ 2026.08.24.24", [m(1, "가 급수", "10", "12", "2.00"), m(2, "냉각탑 보급수", "100.00", "110.00", "10.00"), m(3, "나 급수", "50", "40", "-10")]), "아무이름.xls");
assert.equal(classify(sudo), "수도");
assert.equal(usageMonth("수도", sudo), "2026-08");
assert.deepEqual(expectedPeriod("수도", "2026-08"), { from: "2026-07-25", to: "2026-08-24" });
assert.equal(sudo.meters.length, 3);

const heat = parseFeed(water("2026.08.01.00 ∼ 2026.08.31.24", [m(1, "가", "-", "-", "-", ["1.0", "3.5", "2.5"]), m(2, "나(확인용)", "-", "-", "-", ["0", "9", "9"])]));
assert.equal(classify(heat), "열");
assert.equal(meterTotal("열", heat.meters, [{ no: 1, name: "가", tag: "" }, { no: 2, name: "나", tag: "(확인용)" }]), 2.5);
assert.equal(classify(parseFeed(water("2026.07.01.00 ∼ 2026.08.31.24", []))), "중수");
assert.deepEqual(expectedPeriod("전기", "2026-08"), { from: "2026-08-10", to: "2026-09-09" });

// 계량률 보정: 사용량 10 ÷ 0.2 = 50 → 종료지침 150
const fixes = parseFixText("# 설명\n수도 | 냉각탑 보급수 | 계량률 20%\n");
const fixed = applyFixes("수도", sudo.meters, fixes);
assert.deepEqual(fixed.meters[1].g.수도, { s: 100, e: 150, u: 50 });
assert.equal(fixed.applied.length, 1);

// 중수 미검침분 음수 → 오류, 역행 → 오류
const jung = parseFeed(water("2026.07.01.00 ∼ 2026.08.31.24", [m(4, "다", "1", "61", "60")]));
const checks = runChecks({ kind: "중수", month: "2026-08", feed: jung, meters: jung.meters, tpl: [{ no: 4, name: "다", tag: "[중수]" }], bill: (k) => (k === "고지서!K15" ? 27 : 0) });
assert.ok(checks.some((c) => c.level === "오류" && c.text.includes("-33")));
assert.ok(runChecks({ kind: "수도", month: "2026-08", feed: sudo, meters: sudo.meters, tpl: [], bill: () => 0 }).some((c) => c.level === "오류" && c.text.includes("거꾸로")));
console.log("utility check ok");
