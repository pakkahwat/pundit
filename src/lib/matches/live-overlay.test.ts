import test from "node:test";
import assert from "node:assert/strict";

import type { SportMonksLiveMatch } from "@/lib/football/sportmonks";
import {
  findLiveMatch,
  normalizeTeamName,
  overlayLiveScores,
  sameTeam,
  type MatchLike,
} from "./live-overlay";

const liveFixture = (over: Partial<SportMonksLiveMatch> = {}) => ({
  kickoffAt: "2026-08-29T14:00:00.000Z",
  status: "2nd_half",
  homeTeam: "Manchester City",
  awayTeam: "Crystal Palace",
  homeScore: 2,
  awayScore: 1,
  ...over,
});

const dbMatch = (over: Partial<MatchLike> = {}): MatchLike => ({
  homeTeam: "Manchester City FC",
  awayTeam: "Crystal Palace FC",
  kickoffAt: "2026-08-29T14:00:00.000Z",
  status: "TIMED",
  homeScore: null,
  awayScore: null,
  live: false,
  ...over,
});

test("normalizeTeamName ตัดส่วนต่อท้ายที่บอกประเภทสโมสรและอักขระพิเศษออก", () => {
  assert.equal(
    normalizeTeamName("Manchester City FC"),
    normalizeTeamName("Manchester City"),
  );
  assert.equal(
    normalizeTeamName("Brighton & Hove Albion FC"),
    normalizeTeamName("Brighton and Hove Albion"),
  );
});

test("sameTeam ไม่จับชื่อสั้น ๆ มั่วข้ามทีม", () => {
  assert.equal(sameTeam("Manchester City FC", "Manchester United FC"), false);
  assert.equal(sameTeam("Nottingham Forest FC", "Nottingham Forest"), true);
});

test("findLiveMatch ปฏิเสธนัดที่ชื่อตรงแต่คิกออฟคนละเวลา", () => {
  const live = [liveFixture({ kickoffAt: "2026-08-29T19:00:00.000Z" })];
  assert.equal(findLiveMatch(dbMatch(), live), undefined);
});

test("overlayLiveScores ทับเฉพาะสกอร์/สถานะ ฟิลด์อื่นคงเดิม", () => {
  const base = [{ ...dbMatch(), id: "abc", matchday: 3, predicted: false }];
  const [result] = overlayLiveScores(base, [liveFixture()]);

  assert.equal(result.homeScore, 2);
  assert.equal(result.awayScore, 1);
  assert.equal(result.status, "2nd_half");
  assert.equal(result.live, true);
  // ของที่ผูกกับคำทายต้องรอดมาครบ ไม่งั้นป้าย "ยังไม่ทาย" หายทั้งหน้า
  assert.equal(result.id, "abc");
  assert.equal(result.matchday, 3);
  assert.equal(result.predicted, false);
});

test("overlayLiveScores ไม่แตะนัดที่ไม่ได้อยู่ใน inplay", () => {
  const base = [dbMatch({ homeTeam: "Arsenal FC", awayTeam: "Chelsea FC" })];
  const [result] = overlayLiveScores(base, [liveFixture()]);

  assert.equal(result.live, false);
  assert.equal(result.homeScore, null);
  assert.equal(result.status, "TIMED");
});
