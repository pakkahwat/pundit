import test from "node:test";
import assert from "node:assert/strict";

import {
  CONSECUTIVE_FAILURES_TO_TRIP,
  isCircuitTripped,
  type AttemptRecord,
} from "./circuit";

// สร้างประวัติจากสตริง เช่น "FFFFF" = พัง 5 ครั้งติด (ตัวแรกคือใหม่สุด) แต่ละครั้งคนละนัด
// เว้นแต่จะระบุ matchId เอง
const history = (pattern: string, matchIds?: string[]): AttemptRecord[] =>
  pattern.split("").map((ch, i) => ({
    succeeded: ch === "S",
    matchId: matchIds?.[i] ?? `match-${i}`,
  }));

test("วงจรตัดเมื่อครั้งหลังสุดพังติดกันครบเกณฑ์และกระจายหลายนัด", () => {
  assert.equal(
    isCircuitTripped(history("F".repeat(CONSECUTIVE_FAILURES_TO_TRIP))),
    true,
  );
});

test("ไม่ตัดถ้ามีสำเร็จแทรกอยู่ในช่วงล่าสุด แม้ก่อนหน้านั้นจะพังยาว", () => {
  assert.equal(isCircuitTripped(history("FFSFFFFF")), false);
});

test("สำเร็จครั้งล่าสุดครั้งเดียวก็ปลดวงจร (กู้ตัวเองได้)", () => {
  assert.equal(isCircuitTripped(history("SFFFFF")), false);
});

test("agent ใหม่ที่ประวัติยังไม่ครบเกณฑ์ไม่ถูกตัด แม้จะพังทุกครั้งที่ผ่านมา", () => {
  assert.equal(isCircuitTripped([]), false);
  assert.equal(
    isCircuitTripped(history("F".repeat(CONSECUTIVE_FAILURES_TO_TRIP - 1))),
    false,
  );
});

test("ดูเฉพาะช่วงล่าสุดตามเกณฑ์ — ประวัติเก่ากว่านั้นไม่มีผล", () => {
  const recent = history("F".repeat(CONSECUTIVE_FAILURES_TO_TRIP) + "SS");
  assert.equal(isCircuitTripped(recent), true);
  assert.equal(
    isCircuitTripped(recent, CONSECUTIVE_FAILURES_TO_TRIP + 1),
    false,
  );
});

test("พังซ้ำอยู่นัดเดียวไม่ถือว่าโมเดลล่ม — ไม่ตัด", () => {
  const sameMatch = Array(CONSECUTIVE_FAILURES_TO_TRIP).fill("match-x");
  assert.equal(
    isCircuitTripped(
      history("F".repeat(CONSECUTIVE_FAILURES_TO_TRIP), sameMatch),
    ),
    false,
  );
  // แค่มีนัดที่สองปนอยู่ก็นับว่ากระจายแล้ว
  const twoMatches = [...sameMatch.slice(1), "match-y"];
  assert.equal(
    isCircuitTripped(
      history("F".repeat(CONSECUTIVE_FAILURES_TO_TRIP), twoMatches),
    ),
    true,
  );
});

test("threshold 0 หรือติดลบ = ปิดวงจรตัด ไม่ใช่ตัดทุกตัว", () => {
  assert.equal(isCircuitTripped(history("FFFFF"), 0), false);
  assert.equal(isCircuitTripped([], 0), false);
  assert.equal(isCircuitTripped(history("FFFFF"), -1), false);
});
