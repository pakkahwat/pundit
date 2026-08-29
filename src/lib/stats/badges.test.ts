import test from "node:test";
import assert from "node:assert/strict";

import {
  computeStreaks,
  evaluateBadges,
  isBadgeKey,
  type ScoredRow,
} from "./badges";

const row = (over: Partial<ScoredRow> = {}): ScoredRow => ({
  matchday: 1,
  correct: true,
  predicted: "HOME",
  leadTimeHours: 2,
  submittedHourBkk: 20,
  againstMajority: false,
  ...over,
});

test("computeStreaks: นับสตรีคปัจจุบันกับสตรีคสูงสุดแยกกันถูก", () => {
  // ถูก 4 ติด → พลาด → ถูก 2 ติด: best = 4, current = 2
  const rows = [
    ...Array.from({ length: 4 }, () => row()),
    row({ correct: false }),
    row(),
    row(),
  ];
  assert.deepEqual(computeStreaks(rows), { current: 2, best: 4 });
  assert.deepEqual(computeStreaks([]), { current: 0, best: 0 });
});

test("เหรียญสตรีคให้ตามสตรีคสูงสุดในประวัติ ไม่ใช่สตรีคปัจจุบัน", () => {
  const rows = [
    ...Array.from({ length: 5 }, () => row()),
    row({ correct: false }),
  ];
  const earned = evaluateBadges(rows);
  assert.ok(earned.includes("streak-3"));
  assert.ok(earned.includes("streak-5"));
  assert.ok(!earned.includes("streak-10"));
});

test("จอมแม่น: ต้องมีอย่างน้อย 10 นัด — แม่น 100% จาก 5 นัดยังไม่ได้", () => {
  assert.ok(
    !evaluateBadges(Array.from({ length: 5 }, () => row())).includes(
      "sharpshooter",
    ),
  );
  // 6 ถูก 4 ผิด = 60% พอดี ได้
  const rows = [
    ...Array.from({ length: 6 }, () => row()),
    ...Array.from({ length: 4 }, () => row({ correct: false })),
  ];
  assert.ok(evaluateBadges(rows).includes("sharpshooter"));
});

test("แมตช์เดย์เพอร์เฟกต์: ต้องถูกหมดและมีอย่างน้อย 3 นัดในแมตช์เดย์นั้น", () => {
  const twoOnly = [row({ matchday: 7 }), row({ matchday: 7 })];
  assert.ok(!evaluateBadges(twoOnly).includes("perfect-matchday"));

  const threePerfect = [
    row({ matchday: 7 }),
    row({ matchday: 7 }),
    row({ matchday: 7 }),
    row({ matchday: 8, correct: false }),
  ];
  assert.ok(evaluateBadges(threePerfect).includes("perfect-matchday"));
});

test("สวนมติ: นับเฉพาะครั้งที่สวนแล้ว 'ถูก' เท่านั้น", () => {
  const wrongContrarian = Array.from({ length: 5 }, () =>
    row({ correct: false, againstMajority: true }),
  );
  assert.ok(!evaluateBadges(wrongContrarian).includes("contrarian"));

  const rows = Array.from({ length: 3 }, () =>
    row({ againstMajority: true }),
  );
  assert.ok(evaluateBadges(rows).includes("contrarian"));
});

test("นกตื่นเช้า: ใช้ median ไม่ใช่ mean — ส่งช้าครั้งเดียวไม่ทำให้เสียเหรียญ", () => {
  // 6 นัดส่งล่วงหน้า 48 ชม. + 5 นัดส่ง 1 ชม. → median = 48 ได้เหรียญ
  const rows = [
    ...Array.from({ length: 6 }, () => row({ leadTimeHours: 48 })),
    ...Array.from({ length: 5 }, () => row({ leadTimeHours: 1 })),
  ];
  assert.ok(evaluateBadges(rows).includes("early-bird"));
  // ข้อมูล lead time ไม่ครบ 10 นัด → ยังไม่ตัดสิน
  assert.ok(
    !evaluateBadges(
      Array.from({ length: 5 }, () => row({ leadTimeHours: 48 })),
    ).includes("early-bird"),
  );
});

test("ผู้ปราบ AI: ต้องทั้งชนะ AI และมีตัวอย่างพอ", () => {
  const ten = Array.from({ length: 10 }, () => row());
  assert.ok(
    evaluateBadges(ten, { beatsBestAi: true }).includes("ai-slayer"),
  );
  assert.ok(!evaluateBadges(ten).includes("ai-slayer"));
  assert.ok(
    !evaluateBadges([row()], { beatsBestAi: true }).includes("ai-slayer"),
  );
});

test("isBadgeKey กันคีย์แปลกจาก DB", () => {
  assert.equal(isBadgeKey("streak-3"), true);
  assert.equal(isBadgeKey("hacker-badge"), false);
});

test("เหรียญสายชนิดผล: เซียนเสมอ/สายบุก/ครบเครื่อง นับเฉพาะที่ถูก", () => {
  const rows = [
    ...Array.from({ length: 5 }, () => row({ predicted: "DRAW" })),
    ...Array.from({ length: 10 }, () => row({ predicted: "AWAY" })),
    ...Array.from({ length: 3 }, () => row({ predicted: "HOME" })),
    // ทายเสมอผิดอีก 5 ไม่ควรถูกนับ
    ...Array.from({ length: 5 }, () =>
      row({ predicted: "DRAW", correct: false }),
    ),
  ];
  const earned = evaluateBadges(rows);
  assert.ok(earned.includes("draw-whisperer"));
  assert.ok(earned.includes("away-day"));
  assert.ok(earned.includes("all-rounder"));
  assert.ok(!earned.includes("fortress")); // HOME ถูกแค่ 3 จาก 15 ที่ต้องการ
});

test("คัมแบ็ก: ต้องพลาด 3 ติดแล้วถูก 3 ติด 'ทันที' เท่านั้น", () => {
  const slumpThenRecover = [
    ...Array.from({ length: 3 }, () => row({ correct: false })),
    ...Array.from({ length: 3 }, () => row()),
  ];
  assert.ok(evaluateBadges(slumpThenRecover).includes("comeback"));

  // พลาด 3 → ถูก 2 → พลาด → ถูก 3: ช่วงฟื้นถูกรีเซ็ตกลางทาง ไม่ได้เหรียญ
  const broken = [
    ...Array.from({ length: 3 }, () => row({ correct: false })),
    row(),
    row(),
    row({ correct: false }),
    row(),
    row(),
    row(),
  ];
  assert.ok(!evaluateBadges(broken).includes("comeback"));
});

test("เส้นยาแดงกับนกฮูก: อิงเวลาส่งจริง", () => {
  const clutch = Array.from({ length: 5 }, () =>
    row({ leadTimeHours: 0.5 }),
  );
  assert.ok(evaluateBadges(clutch).includes("clutch"));

  const owl = Array.from({ length: 5 }, () => row({ submittedHourBkk: 2 }));
  assert.ok(evaluateBadges(owl).includes("night-owl"));
  const dayOnly = Array.from({ length: 5 }, () =>
    row({ submittedHourBkk: 14 }),
  );
  assert.ok(!evaluateBadges(dayOnly).includes("night-owl"));
});

test("สายปริมาณ: ประเดิมสนามได้ตั้งแต่นัดแรก ครึ่งร้อย/ร้อยศึก/เพอร์เฟกต์ซ้ำสองตามเกณฑ์", () => {
  assert.ok(evaluateBadges([row()]).includes("first-blood"));
  assert.ok(!evaluateBadges([]).includes("first-blood"));

  const fifty = Array.from({ length: 50 }, (_, i) =>
    row({ matchday: (i % 12) + 1, correct: i % 2 === 0 }),
  );
  const earned = evaluateBadges(fifty);
  assert.ok(earned.includes("half-century"));
  assert.ok(!earned.includes("century"));
  assert.ok(earned.includes("regular")); // กระจาย 12 แมตช์เดย์

  const twoPerfect = [
    ...Array.from({ length: 3 }, () => row({ matchday: 1 })),
    ...Array.from({ length: 3 }, () => row({ matchday: 2 })),
  ];
  assert.ok(evaluateBadges(twoPerfect).includes("double-perfect"));
});
