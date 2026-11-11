// lib/tasks.ts 순수 함수 자체점검 — 프레임워크 없이 node로 직접 실행.
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/tasks.check.mts
import assert from "node:assert/strict";
import { dueGroup, kstDateString, normalizeTasks } from "./tasks.ts";

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

// ── normalizeTasks ────────────────────────────────────────────────
// JSON 배열인지·코드펜스가 붙었는지는 구조화 출력 스키마가 보장하므로 더 보지 않는다.
// 여기서는 스키마가 잡아주지 않는 값 보정만 확인한다.
const [p0] = normalizeTasks([
  {
    title: "소방 수신기 견적",
    note: "3층 오작동",
    category: "facility",
    due: "2026-09-19",
    source: "3층 수신기 오작동",
    shared: true,
    reason: "공용 설비",
  },
]);
assert.equal(p0.title, "소방 수신기 견적");
assert.equal(p0.category, "facility");
assert.equal(p0.due, "2026-09-19");
assert.equal(p0.source, "3층 수신기 오작동");
assert.equal(p0.shared, true);

// 모르는 카테고리 → etc, 잘못된 날짜 → undefined
const [m0] = normalizeTasks([{ title: "임대차 계약 갱신", category: "부동산", due: "내년 봄" }]);
assert.equal(m0.category, "etc", "모르는 카테고리는 etc");
assert.equal(m0.due, undefined, "형식이 틀린 날짜는 버린다");
assert.equal(m0.shared, false, "shared 기본값은 false");

// 제목이 없는 항목은 버린다
assert.equal(normalizeTasks([{ note: "제목 없음" }, { title: "살아남는 항목" }]).length, 1);

// 빈 배열이어도 터지지 않는다
assert.equal(normalizeTasks([]).length, 0);

console.log("✓ tasks.check — normalizeTasks 통과");
