import test from "node:test";
import assert from "node:assert/strict";

import { confidenceOf, normalizeProbabilities } from "./probabilities";

test("ปรับให้รวมได้ 100 พอดี โดยโยนเศษปัดให้ค่าที่ใหญ่สุด", () => {
  assert.deepEqual(normalizeProbabilities({ probHome: 50, probDraw: 25, probAway: 24 }), {
    HOME: 51,
    DRAW: 25,
    AWAY: 24,
  });
  // 1/3 แต่ละอัน -> 33/33/33 แล้วเศษ 1 ไปที่ตัวแรกที่ใหญ่สุด
  assert.deepEqual(normalizeProbabilities({ probHome: 1, probDraw: 1, probAway: 1 }), {
    HOME: 34,
    DRAW: 33,
    AWAY: 33,
  });
});

test("รับสัดส่วน 0-1 ได้ (โมเดลบางตัวส่งแบบนี้)", () => {
  assert.deepEqual(normalizeProbabilities({ probHome: 0.6, probDraw: 0.25, probAway: 0.15 }), {
    HOME: 60,
    DRAW: 25,
    AWAY: 15,
  });
});

test("ขาด/ติดลบ/ไม่ใช่ตัวเลข/รวมเป็นศูนย์ -> null ไม่แต่งตัวเลขเอง", () => {
  assert.equal(normalizeProbabilities(undefined), null);
  assert.equal(normalizeProbabilities({ probHome: 50, probDraw: 50 }), null);
  assert.equal(normalizeProbabilities({ probHome: -1, probDraw: 60, probAway: 41 }), null);
  assert.equal(normalizeProbabilities({ probHome: 0, probDraw: 0, probAway: 0 }), null);
  assert.equal(
    normalizeProbabilities({ probHome: Number.NaN, probDraw: 50, probAway: 50 }),
    null,
  );
  assert.equal(
    normalizeProbabilities({ probHome: 1e308, probDraw: 1e308, probAway: 1e308 }),
    null,
  );
});

test("ความมั่นใจ = ความน่าจะเป็นของผลที่เลือก", () => {
  const p = { HOME: 60, DRAW: 25, AWAY: 15 };
  assert.equal(confidenceOf(p, "HOME"), 60);
  assert.equal(confidenceOf(p, "AWAY"), 15);
  assert.equal(confidenceOf(null, "DRAW"), null);
});
