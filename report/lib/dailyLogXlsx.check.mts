// lib/dailyLogXlsx.ts 자체점검 — 양식에 가짜 일지 2건을 채워 시트 수·칸 값을 확인.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/dailyLogXlsx.check.mts
// 저장소가 공개라 가짜 값만 쓴다.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import PizZip from "pizzip";
import { buildDayXlsx, excelSerial, setCell, xlsxFileName } from "./dailyLogXlsx.ts";
import type { DailyLog } from "./dailyLog.ts";

assert.equal(excelSerial("2026-09-29"), 46294); // 원본 엑셀 L2 값
assert.equal(setCell('<c r="C1" s="3"/><c r="C11" s="7"/>', "C1", "a<b"), '<c r="C1" s="3" t="inlineStr"><is><t xml:space="preserve">a&lt;b</t></is></c><c r="C11" s="7"/>');
assert.throws(() => setCell("<c r=\"A1\"/>", "Z9", 1));

const log = (date: string, power: number, extra: Partial<DailyLog> = {}): DailyLog => ({ date, work: {}, meters: { power }, updatedAt: "", ...extra });
const logs: DailyLog[] = [
  log("2026-08-31", 100),
  log("2026-09-01", 100.5, { people: { to: [9, 0, 2, 2], actual: [8, 0, 2, 2], off: 1, leave: 0 }, work: { 전기: { today: "1. 가짜 점검\n2. 둘째 줄", plan: "내일 계획" }, 미화공용: { today: "청소" } }, special: "특이 없음" }),
  log("2026-09-02", 101),
  log("2026-10-01", 102),
];
const tplBytes = readFileSync(new URL("../public/daily-log-template.xlsx", import.meta.url));
assert.equal(xlsxFileName("2026-09-02"), "[일일업무일지] 바이오 이노베이션 허브_2026.09.02.xlsx");
assert.throws(() => buildDayXlsx(tplBytes, logs, "2026-09-03")); // 그날 일지가 없으면 만들지 않는다
// 9/1 기준이면 9/1 시트 하나 (9/2·전월·다음 달은 빠짐)
assert.deepEqual([...new PizZip(buildDayXlsx(tplBytes, logs, "2026-09-01")).file("xl/workbook.xml")!.asText().matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]), ["09.01"]);
const out = buildDayXlsx(tplBytes, logs, "2026-09-02");
const z = new PizZip(out);
const wb = z.file("xl/workbook.xml")!.asText();
assert.deepEqual([...wb.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]), ["09.01", "09.02"]);
const s1 = z.file("xl/worksheets/sheet1.xml")!.asText();
const v = (s: string, ref: string) => s.match(new RegExp(`<c r="${ref}"[^>]*>(?:<f>[^<]*</f>)?(?:<v>([^<]*)</v>|<is><t[^>]*>([^<]*)</t></is>)`))?.slice(1).find((x) => x !== undefined);
const f = (s: string, ref: string) => s.match(new RegExp(`<c r="${ref}"[^>]*><f>([^<]*)</f>`))?.[1];
assert.equal(v(s1, "L2"), String(excelSerial("2026-09-01")));
assert.equal(v(s1, "G4"), "13"); assert.equal(v(s1, "J4"), "1");
assert.equal(v(s1, "C11"), "1. 가짜 점검\n2. 둘째 줄"); assert.equal(v(s1, "I11"), "내일 계획");
assert.equal(v(s1, "D21"), "청소"); assert.equal(v(s1, "B26"), "특이 없음");
assert.equal(v(s1, "E30"), "100"); assert.equal(v(s1, "I30"), "1800"); // (100.5-100)×3600
// 원본 엑셀과 같은 수식: 첫 시트 누계 =I30, 다음 시트 ='앞시트'!K30+I30
assert.equal(f(s1, "G4"), "SUM(C4:F4)"); assert.equal(f(s1, "J4"), "G4-G5");
assert.equal(f(s1, "I30"), "(G30-E30)*3600"); assert.equal(f(s1, "K30"), "I30");
assert.equal(f(s1, "K31"), "G31+I31"); assert.equal(f(s1, "E31"), undefined);
assert.equal(f(s1, "I32"), undefined); assert.equal(f(s1, "K32"), "I32"); // 지침 없는 날은 사용량 수식 없음
const s2 = z.file("xl/worksheets/sheet2.xml")!.asText();
assert.equal(v(s2, "K30"), "3600"); // 월 누계 1800+1800
assert.equal(f(s2, "K30"), "'09.01'!K30+I30");
assert.equal(f(s2, "E31"), "'09.01'!K31"); assert.equal(f(s2, "K31"), "G31+E31");
assert.deepEqual(wb.match(/<calcPr[^>]*>/g), ['<calcPr calcId="191029" fullCalcOnLoad="1"/>']); // 하나만 (둘이면 엑셀이 못 연다)
// 그날(맨 뒤) 시트만 선택된 채로 열린다
assert.ok(s2.includes('tabSelected="1"')); assert.ok(!s1.includes('tabSelected="1"'));
assert.ok(wb.includes('<workbookView activeTab="1"'));
assert.ok(!z.file("xl/worksheets/sheet3.xml"));
// 주말·공휴일 시트는 빼고(2026-10-03 토·04 일·05 대체공휴일), 그 사이 사용량은 다음 평일 시트로 넘어가 월 누계가 그대로 맞는다
const oct: DailyLog[] = ["01", "02", "03", "04", "05", "06"].map((d, i) => ({ date: `2026-10-${d}`, work: {}, meters: { power: 200 + i, solar: 10 }, updatedAt: "" }));
const zo = new PizZip(buildDayXlsx(tplBytes, [log("2026-09-30", 199), ...oct], "2026-10-06"));
assert.deepEqual([...zo.file("xl/workbook.xml")!.asText().matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]), ["10.01", "10.02", "10.06"]);
const o3 = zo.file("xl/worksheets/sheet3.xml")!.asText();
assert.equal(v(o3, "E30"), "201"); assert.equal(v(o3, "I30"), String(4 * 3600)); assert.equal(v(o3, "K30"), String(6 * 3600)); // 전일 지침 = 10/02
assert.equal(v(o3, "G31"), "40"); assert.equal(v(o3, "K31"), "60"); // 태양광 10/03~06 합쳐서, 월 누계 60
assert.equal(f(o3, "K30"), "'10.02'!K30+I30");
// 쉬는 날 그날 내보내면 그 시트는 만든다
assert.deepEqual([...new PizZip(buildDayXlsx(tplBytes, oct, "2026-10-04")).file("xl/workbook.xml")!.asText().matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]), ["10.01", "10.02", "10.04"]);
if (process.argv[2]) writeFileSync(process.argv[2], out); // 엑셀로 열어 보려면 경로를 넘긴다
console.log("dailyLogXlsx check ok");
