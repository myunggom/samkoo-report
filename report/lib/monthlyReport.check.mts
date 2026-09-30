// lib/monthlyReport.ts 자체점검 — node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/monthlyReport.check.mts
// 공개 저장소라 이름·연락처는 가짜. 근무 패턴은 2026-10 실제 근무표와 같은지 본다.
import assert from "node:assert/strict";
import { addMonths, daysIn, draftMonthly, emptyReport, energyStats, holidaysOf, nextShift, normalizeMonthly, rate, scheduleRow } from "./monthlyReport.ts";
import type { Staff } from "./monthlyReport.ts";

assert.equal(addMonths("2026-12", 1), "2027-01");
assert.equal(daysIn("2026-10").length, 31);

// 일반 근무: 평일 주, 토·일·공휴일(10/3 개천절, 10/5 대체, 10/9 한글날) 휴
const office: Staff = { group: "g", dept: "시설", title: "과장", to: 1, name: "가" };
const oct = holidaysOf("2026-10");
assert.deepEqual(oct, ["2026-10-03", "2026-10-05", "2026-10-09"]);
assert.equal(scheduleRow(office, "2026-10", oct).join(""),
  "주주휴휴휴주주주휴휴휴주주주주주휴휴주주주주주휴휴주주주주주휴");

// 교대기사: 주주야야비비. 2026-10 근무표의 세 가지 시작 위치
const shift = (i: number): Staff => ({ ...office, title: "교대기사", shift: i });
assert.equal(scheduleRow(shift(3), "2026-10", oct).join("").slice(0, 13), "야비비주주야야비비주주야야");
assert.equal(scheduleRow(shift(5), "2026-10", oct).join("").slice(0, 7), "비주주야야비비");
assert.equal(scheduleRow(shift(1), "2026-10", oct).join("").slice(0, 7), "주야야비비주주");
assert.equal(scheduleRow(shift(0), "2026-10", oct)[2], "야", "교대는 공휴일과 상관없이 순환");
assert.equal(scheduleRow(office, "2026-10", oct, { "2026-10-01": "연" })[0], "연", "수동 변경 우선");

// 다음 달로 넘기면 주기가 끊기지 않는다: 10/31 다음 칸 = 11/1
const cyc = "주주야야비비";
const octRow = scheduleRow(shift(3), "2026-10", oct).join("");
const novRow = scheduleRow(shift(nextShift(3, "2026-10")), "2026-11", []).join("");
assert.equal((octRow + novRow).slice(0, 61), Array.from({ length: 61 }, (_, i) => cyc[(3 + i) % 6]).join(""));

// 초안: 표지 차월 → 당월, 사진 비우고 작업명 유지, 교대 주기 한 달 넘김
const sep = emptyReport("2026-09");
sep.cover = { 전기: { now: "9월 일", next: "10월 계획" } };
sep.photos["기계"][0] = { name: "냉동기 점검", a: "u1", b: "u2" };
sep.staff = [office, shift(3)];
const draft = draftMonthly([sep], "2026-10");
assert.equal(draft.cover["전기"].now, "10월 계획");
assert.equal(draft.cover["전기"].next, undefined);
assert.deepEqual(draft.photos["기계"][0], { name: "냉동기 점검" });
assert.equal(draft.staff[1].shift, nextShift(3, "2026-10"), "근무표 달 10월 → 11월");
assert.deepEqual(draft.holidays, holidaysOf("2026-11"));
assert.equal(sep.staff[1].shift, 3, "원본은 그대로");
assert.equal(draftMonthly([sep], "2026-09"), sep, "저장된 달은 그대로");

// 해가 바뀌면 올해 에너지가 작년 칸으로
const dec = emptyReport("2026-12");
dec.energy.elec.usage[0] = 100;
const jan = draftMonthly([dec], "2027-01");
assert.equal(jan.energy.elec.prevUsage[0], 100);
assert.equal(jan.energy.elec.usage[0], null);

// 에너지 통계 (엑셀: 값이 있는 달만 평균)
const st = energyStats([100, 300, null, 0]);
assert.equal(st.sum, 400);
assert.equal(st.avg, 200);
assert.equal(st.max, 300);
assert.equal(rate(110, 100), 0.1);
assert.equal(rate(110, null), null);

// 저장 검사
assert.equal(normalizeMonthly({ month: "2026/09" }), null);
const norm = normalizeMonthly({ ...sep, energy: { elec: { usage: ["1,234", "x"] } } })!;
assert.equal(norm.energy.elec.usage[0], 1234);
assert.equal(norm.energy.elec.usage[1], null);
assert.equal(norm.energy.water.usage.length, 12);

console.log("monthlyReport check ok");