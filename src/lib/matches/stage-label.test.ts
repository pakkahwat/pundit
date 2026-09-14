import test from "node:test";
import assert from "node:assert/strict";

import { buildStageMap, matchdayLabel } from "./stage-label";

test("buildStageMap: นับนัดแรก/นัดสองจากลำดับแมตช์เดย์ในรอบเดียวกัน รอบลีกไม่มี leg", () => {
  const map = buildStageMap([
    { matchday: 10, stage: "PLAYOFFS" },
    { matchday: 1, stage: "LEAGUE_STAGE" },
    { matchday: 9, stage: "PLAYOFFS" },
    { matchday: 8, stage: "LEAGUE_STAGE" },
    { matchday: 17, stage: "FINAL" },
    { matchday: 3, stage: null },
  ]);
  assert.deepEqual(map.get(1), { stage: "LEAGUE_STAGE", leg: null });
  assert.deepEqual(map.get(9), { stage: "PLAYOFFS", leg: 1 });
  assert.deepEqual(map.get(10), { stage: "PLAYOFFS", leg: 2 });
  assert.deepEqual(map.get(17), { stage: "FINAL", leg: null });
  assert.equal(map.has(3), false);
  assert.equal(matchdayLabel(10, map.get(10)), "เพลย์ออฟ นัดสอง");
});

test("buildStageMap: แถวดิบหลายนัดต่อแมตช์เดย์ไม่ทำให้เลขนัดเพี้ยน", () => {
  const raw = [
    ...Array(8).fill({ matchday: 9, stage: "PLAYOFFS" }),
    ...Array(8).fill({ matchday: 10, stage: "PLAYOFFS" }),
  ];
  const map = buildStageMap(raw);
  assert.deepEqual(map.get(9), { stage: "PLAYOFFS", leg: 1 });
  assert.deepEqual(map.get(10), { stage: "PLAYOFFS", leg: 2 });
});

test("รอบลีก/ไม่มี stage = แมตช์เดย์ N", () => {
  assert.equal(matchdayLabel(5), "แมตช์เดย์ 5");
  assert.equal(matchdayLabel(5, null), "แมตช์เดย์ 5");
  assert.equal(matchdayLabel(5, { stage: "REGULAR_SEASON", leg: null }), "แมตช์เดย์ 5");
  assert.equal(matchdayLabel(3, { stage: "LEAGUE_STAGE", leg: null }), "แมตช์เดย์ 3");
});

test("รอบน็อกเอาต์ใช้ชื่อรอบ + นัดแรก/นัดสอง", () => {
  assert.equal(matchdayLabel(9, { stage: "PLAYOFFS", leg: 1 }), "เพลย์ออฟ นัดแรก");
  assert.equal(matchdayLabel(10, { stage: "PLAYOFFS", leg: 2 }), "เพลย์ออฟ นัดสอง");
  assert.equal(matchdayLabel(11, { stage: "LAST_16", leg: 1 }), "รอบ 16 ทีม นัดแรก");
  assert.equal(matchdayLabel(17, { stage: "FINAL", leg: null }), "รอบชิงชนะเลิศ");
});

test("stage ที่ไม่รู้จักแสดงชื่อดิบ ไม่พัง", () => {
  assert.equal(matchdayLabel(20, { stage: "SOMETHING_NEW", leg: null }), "SOMETHING_NEW");
  assert.equal(matchdayLabel(20, { stage: "SOMETHING_NEW", leg: 4 }), "SOMETHING_NEW นัดที่ 4");
});
