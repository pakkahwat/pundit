import test from "node:test";
import assert from "node:assert/strict";

import { detectTeamsInTitle } from "./team-aliases";

test("จับได้ทั้งสองทีมจากพาดหัวที่เล่าถึงแมตช์ และเรียงตามลำดับที่โผล่", () => {
  assert.deepEqual(
    detectTeamsInTitle("เรือใบสีฟ้าโชว์โหดถล่มพาเลซ นำจ่าฝูงพรีเมียร์ลีก"),
    ["Manchester City", "Crystal Palace"],
  );
  assert.deepEqual(
    detectTeamsInTitle("เซบีย่าและเบติสพุ่งนำฝูง! สรุปศึกลาลีกา"),
    ["Sevilla", "Real Betis"],
  );
});

test("ฉายาที่ซ้อนกันต้องจับตัวยาวก่อน", () => {
  // "เรอัล โซเซียดัด" มีคำว่า "เรอัล" ซึ่งเป็นฉายาของ Real Madrid อยู่ข้างใน
  // ถ้าเทียบตัวสั้นก่อน พาดหัวนี้จะกลายเป็นแมตช์ของ Real Madrid สองทีม
  assert.deepEqual(
    detectTeamsInTitle("ราชันบดเรอัล โซเซียดัด! สรุปผลลาลีกาสุดเดือด"),
    ["Real Madrid", "Real Sociedad"],
  );
});

test("พาดหัวที่พูดถึงทีมเดียวคืนทีมเดียว", () => {
  assert.deepEqual(
    detectTeamsInTitle("บาร์ซ่ารัวนิ่ม! ลาลีกาเดือดกับโปรแกรมซดแข้งสุดสัปดาห์"),
    ["Barcelona"],
  );
  assert.deepEqual(
    detectTeamsInTitle("เปิดหัวพรีเมียร์ลีกสุดเดือด ไบรท์ตันรั้งจ่าฝูง"),
    ["Brighton & Hove Albion"],
  );
});

test("พาดหัวที่ไม่เอ่ยชื่อทีมเลยคืนลิสต์ว่าง", () => {
  assert.deepEqual(
    detectTeamsInTitle("ตลาดซัมเมอร์ 2026 เดือด! ส่องดีลสะท้านพรีเมียร์ลีก"),
    [],
  );
});

test("knownTeams กรองทีมนอกลีกออก", () => {
  // "ราชัน" เป็นฉายาของ Real Madrid ถ้าบทความนี้เป็นของพรีเมียร์ลีกก็ไม่ควรจับติด
  assert.deepEqual(
    detectTeamsInTitle("ราชันชุดขาวโชว์ฟอร์ม", ["Arsenal FC", "Chelsea FC"]),
    [],
  );
  // ชื่อใน DB มี "FC"/"CF" ต่อท้าย ต้องยังเทียบติดผ่าน sameTeam
  assert.deepEqual(
    detectTeamsInTitle("ราชันชุดขาวโชว์ฟอร์ม", ["Real Madrid CF"]),
    ["Real Madrid"],
  );
});

test("knownTeams ลิสต์ว่าง = ไม่กรอง ไม่ใช่คัดทุกทีมทิ้ง", () => {
  // บทความที่เขียนวันไม่มีบอลมีลิสต์ทีมว่าง — ต้องยังจับทีมจากพาดหัวได้ตามปกติ
  assert.deepEqual(
    detectTeamsInTitle("เรือใบเตรียมบุกคริสตัล พาเลซ! ตลาดซื้อขายร้อนระอุ", []),
    ["Manchester City", "Crystal Palace"],
  );
});

test("จับได้มากสุดสองทีม", () => {
  const teams = detectTeamsInTitle(
    "สรุปครบ! ลิเวอร์พูล เชลซี อาร์เซนอล และเอฟเวอร์ตัน",
  );
  assert.equal(teams.length, 2);
});
