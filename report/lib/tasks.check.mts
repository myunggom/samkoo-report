// lib/tasks.ts 순수 함수 자체점검 — 프레임워크 없이 node로 직접 실행.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/tasks.check.mts
import assert from "node:assert/strict";
import { dueGroup, kstDateString } from "./tasks.ts";

// 2026-09-15(화) KST 오전 10시 = UTC 01:00
const tueMorning = new Date("2026-09-15T01:00:00Z");
// 같은 날 KST 오전 8시 = UTC 전날 23:00 — UTC로 계산하면 하루가 밀리는 지점
const tueEarly = new Date("2026-09-14T23:00:00Z");

assert.equal(kstDateString(tueMorning), "2026-09-15", "KST 날짜 변환");
assert.equal(kstDateString(tueEarly), "2026-09-15", "KST 오전 8시도 같은 날이어야 한다");

assert.equal(dueGroup("2026-09-14", tueMorning), "overdue", "어제");
assert.equal(dueGroup("2026-09-15", tueMorning), "today", "오늘");
assert.equal(dueGroup("2026-09-16", tueMorning), "week", "내일");
assert.equal(dueGroup("2026-09-20", tueMorning), "week", "이번 주 일요일까지");
assert.equal(dueGroup("2026-09-21", tueMorning), "later", "다음 주 월요일");
assert.equal(dueGroup(undefined, tueMorning), "none", "마감일 없음");
assert.equal(dueGroup("", tueMorning), "none", "빈 문자열");
assert.equal(dueGroup("2026/09/16", tueMorning), "none", "형식이 틀리면 none");

// UTC 기준으로 짰다면 여기서 깨진다 — 오전 8시에 오늘 할 일이 overdue로 밀린다
assert.equal(dueGroup("2026-09-15", tueEarly), "today", "KST 오전 8시에도 오늘은 today");

// 오늘이 일요일이면 week에 해당하는 날이 없고 내일부터 later (설계 §3의 의도된 동작)
const sunday = new Date("2026-09-20T01:00:00Z");
assert.equal(dueGroup("2026-09-20", sunday), "today");
assert.equal(dueGroup("2026-09-21", sunday), "later", "일요일의 내일은 later");

console.log("✓ tasks.check — dueGroup 통과");
