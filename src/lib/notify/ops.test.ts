import test from "node:test";
import assert from "node:assert/strict";

import { opsTransition } from "./ops";

test("พังครั้งแรก -> alert, พังซ้ำสถานะเดิม -> none (ไม่สแปม)", () => {
  assert.equal(opsTransition(null, "error"), "alert");
  assert.equal(opsTransition("ok", "error"), "alert");
  assert.equal(opsTransition("error", "error"), "none");
});

test("กลับมาปกติหลังพัง -> recovered; ปกติตั้งแต่แรก -> แค่บันทึก", () => {
  assert.equal(opsTransition("error", "ok"), "recovered");
  assert.equal(opsTransition("down", "ok"), "recovered");
  assert.equal(opsTransition(null, "ok"), "record");
  assert.equal(opsTransition("ok", "ok"), "none");
});

test("เปลี่ยนชนิดความไม่ปกติ (stale -> error) ก็แจ้งใหม่", () => {
  assert.equal(opsTransition("stale", "error"), "alert");
});
