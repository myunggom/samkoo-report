// lib/weeklyLogXlsx.ts 자체점검 — 양식에 가짜 주간보고를 채워 시트 순서·칸 값을 확인.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/weeklyLogXlsx.check.mts
// 저장소가 공개라 가짜 값만 쓴다.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import PizZip from "pizzip";
import { buildWeeklyXlsx, rowHeight, weeklyXlsxFileName } from "./weeklyLogXlsx.ts";
import type { WeeklyLog } from "./weeklyLog.ts";

assert.equal(weeklyXlsxFileName("2026-09-23"), "[주간업무보고] 바이오 이노베이션 허브_2026.09.23.xlsx");
assert.equal(rowHeight(undefined), 60);                         // 빈 칸도 최소 높이
assert.equal(rowHeight("1. 가\n2. 나\n3. 다\n4. 라\n5. 마"), 126); // 5줄
assert.equal(rowHeight("가".repeat(60)), 60);                   // 한글 60자 = 120단위 → 2줄

const wk = (date: string, done: string): WeeklyLog => ({
  date, thisFrom: "2026-09-18", thisTo: date, nextFrom: "2026-09-28", nextTo: "2026-10-01",
  work: { 행정: { done, plan: "다음 할 일" }, 미화: { done: "청소" } }, updatedAt: "",
});
const all = [wk("2025-12-30", "작년"), wk("2026-09-16", "지난주 일"), wk("2026-09-23", "1. 가짜 업무\n2. 둘째"), wk("2026-09-30", "다음주")];
const tpl = readFileSync(new URL("../public/weekly-log-template.xlsx", import.meta.url));
assert.throws(() => buildWeeklyXlsx(tpl, all, "2026-09-24")); // 그날 보고가 없으면 만들지 않는다
const out = buildWeeklyXlsx(tpl, all, "2026-09-23");
const z = new PizZip(out);
const wb = z.file("xl/workbook.xml")!.asText();
// 최신이 맨 앞, 다른 해·이후 보고는 빠짐, 열면 맨 앞 시트
assert.deepEqual([...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]), ["2026.09.23", "2026.09.16"]);
assert.ok(wb.includes('<workbookView activeTab="0"'));
const s1 = z.file("xl/worksheets/sheet1.xml")!.asText();
const t = (ref: string) => s1.match(new RegExp(`<c r="${ref}"[^>]*><is><t[^>]*>([^<]*)</t></is>`))?.[1];
assert.equal(t("B3"), "이번주 업무수행(26.09.18~09.23)");
assert.equal(t("C3"), "다음주 업무 계획(26.09.28~10.01)");
assert.equal(t("B5"), "1. 가짜 업무\n2. 둘째"); assert.equal(t("C5"), "다음 할 일");
assert.equal(t("B10"), "청소"); assert.equal(t("B6"), undefined);
assert.match(s1, /<row r="5"[^>]* ht="60"/);
assert.ok(s1.includes('tabSelected="1"'));
assert.ok(!z.file("xl/worksheets/sheet2.xml")!.asText().includes('tabSelected="1"'));
if (process.argv[2]) writeFileSync(process.argv[2], out); // 엑셀로 열어 보려면 경로를 넘긴다
console.log("weeklyLogXlsx check ok");
