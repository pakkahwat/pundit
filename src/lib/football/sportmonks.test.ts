import test from "node:test";
import assert from "node:assert/strict";

import { mapEvents, minuteFromPeriods } from "./sportmonks";

test("minuteFromPeriods: ใช้นาทีของพีเรียดที่นาฬิกากำลังเดินเท่านั้น", () => {
  // ครึ่งหลังกำลังเตะ — ครึ่งแรกจบไปแล้ว (ticking: false ค้าง 45 นาที)
  assert.equal(
    minuteFromPeriods([
      { ticking: false, minutes: 45 },
      { ticking: true, minutes: 67 },
    ]),
    67,
  );
});

test("minuteFromPeriods: พักครึ่ง/ไม่มีข้อมูล คืน null", () => {
  assert.equal(minuteFromPeriods([{ ticking: false, minutes: 45 }]), null);
  assert.equal(minuteFromPeriods([]), null);
  assert.equal(minuteFromPeriods(undefined), null);
  // ticking แต่ไม่มีเลขนาที — อย่าเดา
  assert.equal(minuteFromPeriods([{ ticking: true }]), null);
});

test("mapEvents: เก็บเฉพาะประตู/จุดโทษ/ใบแดง แยกฝั่งถูก และเรียงตามนาที", () => {
  const events = mapEvents(
    [
      {
        participant_id: 99,
        player_name: "Somchai",
        minute: 70,
        type: { developer_name: "GOAL" },
      },
      {
        participant_id: 1,
        player_name: "Haaland",
        minute: 23,
        type: { developer_name: "GOAL" },
      },
      {
        participant_id: 1,
        player_name: "Rodri",
        minute: 55,
        type: { developer_name: "YELLOWCARD" }, // ใบเหลืองต้องถูกทิ้ง
      },
      {
        participant_id: 99,
        player_name: "Eze",
        minute: 45,
        extra_minute: 2,
        type: { developer_name: "PENALTY" },
      },
    ],
    1,
  );

  assert.deepEqual(
    events.map((e) => [e.kind, e.side, e.minute, e.extraMinute]),
    [
      ["goal", "home", 23, null],
      ["penalty", "away", 45, 2],
      ["goal", "away", 70, null],
    ],
  );
});

test("mapEvents: ใบแดงจากเหลืองสองใบนับเป็นใบแดง และ event ไม่มี type ถูกทิ้งเงียบ ๆ", () => {
  const events = mapEvents(
    [
      { participant_id: 1, minute: 80, type: { developer_name: "YELLOWREDCARD" } },
      { participant_id: 1, minute: 81, type: null },
      { participant_id: 1, minute: 82 },
    ],
    1,
  );
  assert.deepEqual(events.map((e) => e.kind), ["redcard"]);
});
