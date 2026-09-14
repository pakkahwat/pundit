import test from "node:test";
import assert from "node:assert/strict";

import {
  COUNCIL_NEAR_KICKOFF_MS,
  councilShouldVote,
  tallyCouncil,
  type CouncilVote,
} from "./council";

const vote = (
  displayName: string,
  outcome: CouncilVote["outcome"],
  probabilities: CouncilVote["probabilities"] = null,
): CouncilVote => ({ agentKey: displayName, displayName, outcome, probabilities });

test("เสียงข้างมากชนะ และความน่าจะเป็นของสภา = สัดส่วนโหวตแบบ smoothing รวม 100", () => {
  const d = tallyCouncil([
    vote("A", "HOME"),
    vote("B", "HOME"),
    vote("C", "AWAY"),
  ]);
  assert.ok(d);
  assert.equal(d.outcome, "HOME");
  assert.equal(d.tieBrokenBy, null);
  assert.deepEqual(d.counts, { HOME: 2, DRAW: 0, AWAY: 1 });
  // (2+1)/6, (0+1)/6, (1+1)/6 = 50/17/33
  assert.deepEqual(d.probabilities, { HOME: 50, DRAW: 17, AWAY: 33 });
  assert.match(d.reasoning, /เหย้า 2 \(A, B\)/);
  assert.match(d.reasoning, /เยือน 1 \(C\)/);
});

test("เอกฉันท์ไม่ใช่ 100% — ยิ่งเสียงเยอะยิ่งมั่นใจขึ้น แต่ไม่มีวันถึง 100", () => {
  // (3+1)/6 = 66.7, (0+1)/6 = 16.7 x2 -> ปัดได้ 67/17/17 = 101 เศษ -1 ตกที่ผู้ชนะ
  const three = tallyCouncil([vote("A", "HOME"), vote("B", "HOME"), vote("C", "HOME")]);
  assert.deepEqual(three?.probabilities, { HOME: 66, DRAW: 17, AWAY: 17 });
  const six = tallyCouncil(
    ["A", "B", "C", "D", "E", "F"].map((n) => vote(n, "HOME")),
  );
  assert.equal(six?.probabilities.HOME, 78);
  assert.equal(
    six!.probabilities.HOME + six!.probabilities.DRAW + six!.probabilities.AWAY,
    100,
  );
});

test("เสมอกันตัดสินด้วยผลรวมความมั่นใจของฝั่งที่เสมอ", () => {
  const d = tallyCouncil([
    vote("A", "HOME", { HOME: 55, DRAW: 25, AWAY: 20 }),
    vote("B", "AWAY", { HOME: 20, DRAW: 20, AWAY: 60 }),
  ]);
  assert.ok(d);
  assert.equal(d.outcome, "AWAY");
  assert.equal(d.tieBrokenBy, "probabilities");
  assert.deepEqual(d.probabilities, { HOME: 40, DRAW: 20, AWAY: 40 });
  assert.match(d.reasoning, /ตัดสินด้วยผลรวมความมั่นใจ/);
});

test("เสมอกันและไม่มีความมั่นใจให้ดู -> ให้เจ้าบ้านก่อน เสมอก่อนเยือน", () => {
  const homeDraw = tallyCouncil([vote("A", "DRAW"), vote("B", "HOME")]);
  assert.equal(homeDraw?.outcome, "HOME");
  assert.equal(homeDraw?.tieBrokenBy, "home-advantage");

  const drawAway = tallyCouncil([vote("A", "AWAY"), vote("B", "DRAW")]);
  assert.equal(drawAway?.outcome, "DRAW");
});

test("ความมั่นใจของฝั่งที่ไม่ได้เสมอไม่มีผลต่อการตัดสิน", () => {
  // DRAW ได้ 2 เสียง ชนะเลย แม้ AWAY ตัวเดียวจะมั่นใจ 99%
  const d = tallyCouncil([
    vote("A", "DRAW", { HOME: 30, DRAW: 40, AWAY: 30 }),
    vote("B", "DRAW", { HOME: 30, DRAW: 40, AWAY: 30 }),
    vote("C", "AWAY", { HOME: 0, DRAW: 1, AWAY: 99 }),
  ]);
  assert.equal(d?.outcome, "DRAW");
});

test("ไม่มีเสียงเลย -> null", () => {
  assert.equal(tallyCouncil([]), null);
});

test("รอให้ครบทุกตัวก่อน เว้นแต่ใกล้คิกออฟและมีอย่างน้อย 2 เสียง", () => {
  const far = COUNCIL_NEAR_KICKOFF_MS * 2;
  const near = COUNCIL_NEAR_KICKOFF_MS - 1;
  assert.equal(councilShouldVote({ votes: 5, required: 5, msToKickoff: far }), true);
  assert.equal(councilShouldVote({ votes: 4, required: 5, msToKickoff: far }), false);
  assert.equal(councilShouldVote({ votes: 4, required: 5, msToKickoff: near }), true);
  assert.equal(councilShouldVote({ votes: 1, required: 5, msToKickoff: near }), false);
  assert.equal(councilShouldVote({ votes: 0, required: 0, msToKickoff: near }), false);
  // ไม่มีตัวไหนทำงานได้เลย (required 0) แต่มีเสียงเก่าอยู่ -> โหวตได้
  assert.equal(councilShouldVote({ votes: 1, required: 0, msToKickoff: far }), true);
});
