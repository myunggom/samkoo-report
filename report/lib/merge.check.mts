// lib/merge.ts 자체점검 — node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON lib/merge.check.mts
import assert from "node:assert/strict";
import { merge3 } from "./merge.ts";

// 월간 보고서처럼 행 배열: 같은 길이면 칸마다, 내가 행을 추가하면 통째로 내 것
const base = { cover: { 전기: { now: "a" } }, facility: [{ s: "" }, { s: "" }], updatedAt: "1" };
const server = { cover: { 전기: { now: "b" } }, facility: [{ s: "완료" }, { s: "" }], updatedAt: "2" };
let m = merge3(server, base, { cover: { 전기: { now: "a" } }, facility: [{ s: "" }, { s: "진행중" }], updatedAt: "1" });
assert.deepEqual(m.value.facility, [{ s: "완료" }, { s: "진행중" }], "다른 행의 상태는 둘 다 남는다");
assert.equal(m.value.cover.전기.now, "b");
assert.equal(m.others, 2);
assert.deepEqual(m.conflicts, []);

m = merge3(server, base, { ...base, facility: [{ s: "" }, { s: "" }, { s: "계획중" }] });
assert.equal(m.value.facility.length, 3);
assert.deepEqual(m.conflicts, ["facility"], "남이 고친 배열에 내가 행을 추가하면 충돌로 알린다");
console.log("merge check ok");
