import test from "node:test";
import assert from "node:assert/strict";

import {
  formatKickoffThai,
  formatPreviewSource,
  looksLikeTip,
  resolveFixture,
  resolveFocusTeams,
  teamNamesFromSource,
  type PreviewSource,
} from "./article-source";

test("looksLikeTip จับประโยคฟันธง/ชี้นำผล แต่ปล่อยภาษาคอลัมน์ทั่วไป", () => {
  for (const tip of [
    "ฟันธงเลยว่าอาร์เซนอลเก็บชัย",
    "เกมนี้ทายว่าเชลซีบุกชนะ",
    "ลิเวอร์พูลน่าจะชนะได้ไม่ยาก",
    "แมนซิตี้เป็นตัวเต็งของคู่นี้",
    "เรอัลน่าจะเก็บ 3 แต้มได้",
    "ควรทายเจ้าบ้านไว้ก่อน",
  ]) {
    assert.equal(looksLikeTip(tip), true, tip);
  }
  for (const ok of [
    "เกมนี้น่าจะสนุกแน่นอน มาลุ้นกันว่าใครจะเก็บแต้ม",
    "ทั้งสองทีมยังไม่เคยเจอกันในข้อมูลที่มี",
    "เจ้าบ้านฟอร์มล่าสุด W W D ส่วนทีมเยือนแพ้สองนัดติด",
    "ใครจะแม่นหรือใครจะแป้กในสัปดาห์นี้ มาทายผลไปด้วยกัน",
  ]) {
    assert.equal(looksLikeTip(ok), false, ok);
  }
});

const preview: PreviewSource = {
  kind: "preview",
  date: "2026-09-18",
  seasonName: "Premier League",
  matchday: 5,
  fixtures: [
    {
      homeTeam: "Arsenal FC",
      awayTeam: "Chelsea FC",
      kickoffAt: "2026-09-20T14:00:00Z",
      homeForm: "W W D W L",
      awayForm: "L D W W W",
      homeRank: 1,
      awayRank: 4,
      homePoints: 10,
      awayPoints: 7,
      headToHead: "Arsenal FC 2-1 Chelsea FC · Chelsea FC 0-0 Arsenal FC",
    },
    {
      homeTeam: "Burnley FC",
      awayTeam: "Everton FC",
      kickoffAt: "2026-09-21T13:00:00Z",
      homeForm: "",
      awayForm: "D",
      homeRank: null,
      awayRank: 12,
      homePoints: null,
      awayPoints: 4,
      headToHead: "",
    },
  ],
  standings: [
    { rank: 1, team: "Arsenal FC", played: 4, points: 10, goalDiff: 6 },
  ],
  predictorAccuracy: [
    { name: "เอ", isAi: false, scored: 20, correct: 12 },
    { name: "บิ๊กเบิ้ม", isAi: true, scored: 20, correct: 11 },
  ],
};

test("prompt พรีวิวมีโปรแกรม ฟอร์ม อันดับ h2h และเวลาไทย แต่ไม่มีคำทายของใคร", () => {
  const text = formatPreviewSource(preview);
  assert.match(text, /พรีวิวแมตช์เดย์ 5/);
  assert.match(text, /Arsenal FC พบ Chelsea FC — เตะ .*21:00/);
  assert.match(text, /อันดับ 1 \(10 แต้ม\) · ฟอร์ม W W D W L/);
  assert.match(text, /Burnley FC: ยังไม่มีอันดับ · ฟอร์ม ยังไม่มีข้อมูล/);
  assert.match(text, /ยังไม่เคยเจอกันในข้อมูลที่มี/);
  assert.match(text, /บิ๊กเบิ้ม \(AI\) — ทายถูก 11 จาก 20 นัด/);
  assert.doesNotMatch(text, /HOME|DRAW|AWAY|ทายว่า/);
});

test("formatKickoffThai แปลงเป็นเวลาไทย และคืนว่างเมื่อวันที่เสีย", () => {
  assert.match(formatKickoffThai("2026-09-20T14:00:00Z"), /21:00/);
  assert.equal(formatKickoffThai("not-a-date"), "");
});

test("resolveFixture/teamNamesFromSource รู้จักโปรแกรมของพรีวิว (fixtures)", () => {
  assert.deepEqual(teamNamesFromSource(preview).sort(), [
    "Arsenal FC",
    "Burnley FC",
    "Chelsea FC",
    "Everton FC",
  ]);
  assert.deepEqual(resolveFixture(["Chelsea", "Arsenal"], preview, { preferUpcoming: true }), {
    homeTeam: "Arsenal FC",
    awayTeam: "Chelsea FC",
  });
});

test("resolveFocusTeams เทียบชื่อที่โมเดลส่งมากับชื่อจริง ทิ้งทีมที่ไม่รู้จัก และไม่เกิน 2", () => {
  const known = ["Arsenal FC", "Chelsea FC", "Everton FC"];
  assert.deepEqual(
    resolveFocusTeams(["Chelsea", "Real Madrid", "Arsenal", "Everton"], known),
    ["Chelsea FC", "Arsenal FC"],
  );
  assert.deepEqual(resolveFocusTeams(undefined, known), []);
});
