// lib/weeklyLog.ts 자체점검 — node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/weeklyLog.check.mts
// 공개 저장소라 가짜 값만 쓴다.
import assert from "node:assert/strict";
import { compileFromDaily, draftWeekly, joinItems, normalizeWeekly, periodLabel, splitItems } from "./weeklyLog.ts";
import type { DailyLog } from "./dailyLog.ts";

assert.equal(periodLabel("2026-09-18", "2026-09-23"), "26.09.18~09.23");

// 번호·하위 줄 쪼개기
assert.deepEqual(splitItems("1. A 점검\n - 업체 방문\n2. B 작성\n\n"), [["A 점검", "- 업체 방문"], ["B 작성"]]);
// 같은 항목은 한 번만, 하위 줄은 합치고 번호는 새로
assert.equal(joinItems([["A 점검", "- 1층"], ["B 작성"], ["A 점검", "- 2층"], ["A  점검"]]), "1. A 점검\n - 1층\n - 2층\n2. B 작성");

const day = (date: string, work: DailyLog["work"]): DailyLog => ({ date, work, meters: {}, updatedAt: "" });
const dailies = [
  day("2026-09-17", { 전기: { today: "1. 옛날 일" } }), // 기간 밖
  day("2026-09-18", { 전기: { today: "1. 전기시설물 점검\n2. UPS 점검" }, 민원: { today: "1. 민원 응대" }, 미화공용: { today: "1. 1층 청소" } }),
  day("2026-09-21", { 전기: { today: "1. 전기시설물 점검\n2. 열화상 점검", plan: "1. 계량기 검침" }, 행정: { today: "1. 서류 정리" }, 미화전용: { today: "1. 전용부 청소" } }),
];
const w = compileFromDaily(dailies, "2026-09-18", "2026-09-23");
assert.equal(w["전기"].done, "1. 전기시설물 점검\n2. UPS 점검\n3. 열화상 점검", "여러 날 합치고 중복 제거");
assert.equal(w["전기"].plan, "1. 계량기 검침", "마지막 일지의 명일 계획");
assert.equal(w["행정"].done, "1. 민원 응대\n2. 서류 정리", "민원+행정 → 행정");
assert.equal(w["미화"].done, "1. 1층 청소\n2. 전용부 청소", "공용부+전용부 → 미화");
assert.equal(w["기계"], undefined, "일지가 없는 분야는 비움");

// 초안: 기간은 지난 보고 다음 날~보고일, 일지 없는 분야는 지난주 계획으로
const prev = normalizeWeekly({ date: "2026-09-17", thisFrom: "2026-09-11", thisTo: "2026-09-17", nextFrom: "2026-09-18", nextTo: "2026-09-24",
  work: { 기계: { plan: "1. 냉동기 점검" }, 전기: { plan: "1. 무시됨" } } })!;
const draft = draftWeekly([prev], dailies, "2026-09-23");
assert.equal(draft.thisFrom, "2026-09-18");
assert.equal(draft.nextFrom, "2026-09-24");
assert.equal(draft.nextTo, "2026-09-30");
assert.equal(draft.work["기계"].done, "1. 냉동기 점검", "일지 없으면 지난주 계획");
assert.equal(draft.work["전기"].done, w["전기"].done, "일지가 있으면 일지 우선");
assert.equal(draftWeekly([prev], dailies, "2026-09-17"), prev, "저장된 주는 그대로");

assert.equal(normalizeWeekly({ date: "2026-09-23" }), null, "기간 빠지면 거부");
console.log("weeklyLog check ok");
