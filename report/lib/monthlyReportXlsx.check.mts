// lib/monthlyReportXlsx.ts 자체점검 — node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/monthlyReportXlsx.check.mts "<월간보고서 엑셀 양식.xlsx>"
// 양식에는 실명·사진이 있어 저장소에 두지 않는다 — 경로를 받아서 가짜 보고서로 채운 뒤 핵심 칸만 확인한다.
// 실제 2026.09 웹 자료 ↔ 원본 엑셀 대조는 2026-10-23 로컬에서 함 (4-2 사진·5-2 본사 인원 근무 외 0칸 차이, 엑셀에서 열림 확인).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import PizZip from "pizzip";
import { fillMonthlyXlsx } from "./monthlyReportXlsx.ts";
import { draftMonthly } from "./monthlyReport.ts";

const path = process.argv[2];
if (!path) { console.log("양식 경로를 주세요 — 건너뜀"); process.exit(0); }
const m = draftMonthly([], "2026-11");
m.cover["전기"] = { now: "가짜 당월", next: "가짜 차월" };
m.energy.elec.usage = [1, 2, 3, null, null, null, null, null, null, null, null, null];
m.photos["보안"] = [{ name: "가짜 세트", a: "x://a", b: "x://b" }];
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
let asked = 0;
const r = await fillMonthlyXlsx(readFileSync(path), m, async () => (asked++, { bytes: png, ext: "png" }));
const zip = new PizZip(r.bytes);
const sheetXml = (n: number) => zip.file(`xl/worksheets/sheet${n}.xml`)!.asText();
assert.match(sheetXml(1), /<c r="Q2"[^>]*><v>46296<\/v>/, "표지 Q2 = 2026-10-01");
assert.match(sheetXml(1), /<c r="D28"[^>]*t="inlineStr"><is><t xml:space="preserve">가짜 당월/);
assert.match(sheetXml(6), /<c r="E7"[^>]*><v>3<\/v>/, "2-2 전기 3월 사용량");
assert.doesNotMatch(sheetXml(6), /<c r="F7"[^>]*><v>/, "빈 달은 비움");
assert.ok(asked >= 2, "보안 사진 두 장을 받아 넣는다");
assert.ok(!zip.file("xl/calcChain.xml"), "계산 순서표는 지운다");
assert.match(zip.file("xl/workbook.xml")!.asText(), /fullCalcOnLoad="1"/);
console.log("monthlyReportXlsx check ok", r.notes);
