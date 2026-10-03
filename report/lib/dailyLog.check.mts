// lib/dailyLog.ts 순수 함수 자체점검 — 프레임워크 없이 node로 직접 실행.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/dailyLog.check.mts
// 저장소가 공개라 실제 고객사 값이 아닌 가짜 값만 쓴다.
import assert from "node:assert/strict";
import { draftFor, meterRows, normalizeLog, solarFromMonthTotal } from "./dailyLog.ts";
import type { DailyLog } from "./dailyLog.ts";

const log = (date: string, meters: DailyLog["meters"], extra: Partial<DailyLog> = {}): DailyLog => ({
  date, work: {}, meters, updatedAt: "", ...extra,
});

// 8/31 = 전월 말 지침만 있는 줄. 9/7 은 주말을 건너뜀
const logs: DailyLog[] = [
  log("2026-08-31", { power: 100.0, heat: 50.0, water: 10 }),
  log("2026-09-03", { power: 100.5, solar: 200, heat: 50.02, water: 12 }, {
    people: { to: [9, 0, 2, 2], actual: [9, 0, 2, 2], off: 0, leave: 1 },
    work: { 전기: { today: "A 점검", plan: "B 점검", note: "비고1" } },
  }),
  log("2026-09-04", { power: 100.8, solar: 300, heat: 50.05, water: 12 }),
  log("2026-09-07", { power: 101.8, solar: 900, heat: 50.1, water: 11 }),
];

const byKey = (date: string) => Object.fromEntries(meterRows(logs, date).map((r) => [r.def.key, r]));

// 첫날: 전월 말 지침이 전일검침. 전력은 배율 3600
let r = byKey("2026-09-03");
assert.equal(r.power.prev, 100.0);
assert.equal(r.power.usage, 1800, "(100.5-100)*3600");
assert.equal(r.power.month, 1800, "월 첫 기록이면 누계 = 사용량");
assert.equal(r.heat.usage, 0.02, "부동소수 찌꺼기 없이");

// 주말을 건너뛴 날: 직전 기록(9/4)이 전일검침
r = byKey("2026-09-07");
assert.equal(r.power.prev, 100.8);
assert.equal(r.power.usage, 3600, "(101.8-100.8)*3600");
assert.equal(r.power.month, 1800 + 1080 + 3600, "월 누계는 날짜별 사용량 합");

// 태양광: 입력값이 그날 발전량, 전일 칸 = 이번 달 어제까지 누계 (예전 엑셀과 동일)
assert.equal(r.solar.today, 900);
assert.equal(r.solar.prev, 500);
assert.equal(r.solar.month, 1400);
assert.equal(r.solar.usage, null);

// 지침이 줄면 경고
assert.equal(r.water.usage, -1);
assert.ok(r.water.warn, "음수 사용량 경고");

// 입력 안 한 계량기는 빈칸, 누계는 0
assert.equal(r.gas.today, null);
assert.equal(r.gas.usage, null);
assert.equal(r.gas.month, 0);

// 다음 달 1일: 누계는 새로 시작하지만 전일검침은 전월 마지막 값
const oct = [...logs, log("2026-10-01", { power: 102.0 })];
const o = Object.fromEntries(meterRows(oct, "2026-10-01").map((x) => [x.def.key, x]));
assert.equal(o.power.prev, 101.8);
assert.equal(o.power.month, 720, "(102-101.8)*3600, 9월 사용량은 빠진다");

// 새 날짜 초안: 인원은 그대로, 어제 '명일 계획'이 오늘 '금일'로
const d = draftFor(logs, "2026-09-08");
assert.deepEqual(d.people?.to, [9, 0, 2, 2]);
assert.equal(d.work["전기"].today, "B 점검");
assert.equal(d.work["전기"].plan, "B 점검");
assert.equal(d.work["전기"].note, "비고1");
assert.deepEqual(d.meters, {}, "계량은 매일 새로");
// 이미 저장된 날짜는 저장본 그대로
assert.equal(draftFor(logs, "2026-09-03").work["전기"].today, "A 점검");

// 입력 검증: 형식 틀린 날짜·모르는 구분·숫자 아닌 계량값은 버린다
assert.equal(normalizeLog({ date: "2026/09/29" }), null);
const n = normalizeLog({
  date: "2026-09-29",
  work: { 전기: { today: "  점검 \r\n완료  ", plan: "" }, 해킹: { today: "x" } },
  meters: { power: "267.08", solar: "", gas: "abc" },
  people: { to: [9, "0", -3], actual: [9], off: "1", leave: 0 },
});
assert.ok(n);
assert.deepEqual(Object.keys(n.work), ["전기"]);
assert.equal(n.work["전기"].today, "  점검 \n완료");
assert.equal(n.work["전기"].plan, undefined);
assert.deepEqual(n.meters, { power: 267.08 });
assert.deepEqual(n.people?.to, [9, 0, 0, 0], "음수·빈 값은 0");
assert.equal(n.people?.off, 1);

// 전력 3요소: 합이 전력 지침이 된다. 한 칸이라도 비면 3요소는 버리고 입력된 power 유지
const pp = normalizeLog({ date: "2026-09-29", powerParts: ["85.17", 43.89, 138.02], meters: { power: 1 } });
assert.deepEqual(pp?.powerParts, [85.17, 43.89, 138.02]);
assert.equal(pp?.meters.power, 267.08, "85.17+43.89+138.02, 부동소수 찌꺼기 없이");
const pp2 = normalizeLog({ date: "2026-09-29", powerParts: [85.17, "", 138.02], meters: { power: 267.08 } });
assert.equal(pp2?.powerParts, undefined);
assert.equal(pp2?.meters.power, 267.08);

// 태양광: 금월 발전량(MWh) − 어제까지 이번 달 일 발전량(kWh 합) = 오늘(kWh)
// logs 의 9월 태양광: 200+300+900 = 1400 kWh
assert.equal(solarFromMonthTotal(logs, "2026-09-08", 1.95), 550, "1.95 MWh = 1950 kWh − 1400");
assert.equal(solarFromMonthTotal(logs, "2026-09-04", 0.5), 300, "9/3 까지만(200) 뺀다");
assert.equal(solarFromMonthTotal(logs, "2026-10-01", 0.123), 123, "달이 바뀌면 전월은 빼지 않는다");
assert.equal(normalizeLog({ date: "2026-09-08", solarMonthMWh: "1.95" })?.solarMonthMWh, 1.95);
assert.equal(normalizeLog({ date: "2026-09-08", solarMonthMWh: "abc" })?.solarMonthMWh, undefined);

console.log("dailyLog check ok");

// ── 동시 편집 합치기 ─────────────────────────────────────────────
{
  const { mergeLog } = await import("./dailyLog.ts");
  const base = log("2026-09-10", { water: 10 }, { work: { 전기: { today: "원래" } } });
  // A가 먼저 저장: 전기 금일 + 수도
  const server = log("2026-09-10", { water: 11 }, { work: { 전기: { today: "A가 씀" } } });
  // B는 같은 base 에서 기계 금일 + 가스만 고침
  const mine = log("2026-09-10", { water: 10, gas: 5 }, { work: { 전기: { today: "원래" }, 기계: { today: "B가 씀" } } });
  let m = mergeLog(server, base, mine);
  assert.equal(m.log.work.전기.today, "A가 씀", "남이 고친 칸은 살아남는다");
  assert.equal(m.log.work.기계.today, "B가 씀", "내가 고친 칸도 들어간다");
  assert.equal(m.log.meters.water, 11);
  assert.equal(m.log.meters.gas, 5);
  assert.deepEqual(m.conflicts, []);
  assert.equal(m.others, 2, "남이 고친 칸 2개(전기 금일·수도)를 받아 옴");

  // 같은 칸을 둘 다 고치면 내 값 + 충돌 알림
  m = mergeLog(server, base, log("2026-09-10", { water: 10 }, { work: { 전기: { today: "B도 씀" } } }));
  assert.equal(m.log.work.전기.today, "B도 씀");
  assert.deepEqual(m.conflicts, ["work.전기.today"]);

  // 내가 지운 칸은 지워진다 (남이 안 건드렸으면)
  m = mergeLog(base, base, log("2026-09-10", { water: 10 }));
  assert.equal(m.log.work.전기, undefined);

  // 인원은 팀별 칸 단위
  const p = (to: number[]) => log("2026-09-10", {}, { people: { to, actual: [0, 0, 0, 0], off: 0, leave: 0 } });
  m = mergeLog(p([9, 1, 0, 0]), p([0, 0, 0, 0]), p([0, 0, 2, 0]));
  assert.deepEqual(m.log.people!.to, [9, 1, 2, 0]);

  // 서버에 그날 일지가 없으면 내 것 그대로
  assert.equal(mergeLog(undefined, undefined, mine).log, mine);
}
console.log("merge ok");
