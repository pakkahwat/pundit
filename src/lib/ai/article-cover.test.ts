import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyArticleTopic,
  coverSearchQueries,
  isPexelsImageUrl,
  parseVsBannerUrl,
  pexelsQueries,
  pexelsQueriesFor,
  pickBySeed,
  vsBannerUrl,
  type ArticleTopic,
} from "./article-cover";

const ALL_TOPICS: ArticleTopic[] = [
  "transfer",
  "injury",
  "match",
  "preview",
  "standings",
  "predictions",
  "general",
];

test("พาดหัวข่าวตลาดซื้อขายถูกจัดเป็น transfer", () => {
  assert.equal(
    classifyArticleTopic("ตลาดซัมเมอร์ 2026 เดือด! ส่องดีลสะท้านพรีเมียร์ลีก"),
    "transfer",
  );
  assert.equal(
    classifyArticleTopic("เรือใบเตรียมบุกคริสตัล พาเลซ! ตลาดซื้อขายร้อนระอุ"),
    "transfer",
  );
});

test("พาดหัวสรุปผลแข่งถูกจัดเป็น match", () => {
  assert.equal(
    classifyArticleTopic("ราชันชุดขาวถล่มโหด! สรุปผลลาลีกาและความเดือดตารางคะแนน"),
    "match",
  );
  assert.equal(
    classifyArticleTopic("เรือใบสีฟ้าโชว์โหดถล่มพาเลซ นำจ่าฝูงพรีเมียร์ลีก"),
    "match",
  );
});

test("พาดหัวที่พูดถึงโปรแกรมล่วงหน้าถูกจัดเป็น preview", () => {
  assert.equal(
    classifyArticleTopic("ลาลีกาเดือดกับโปรแกรมซดแข้งสุดสัปดาห์"),
    "preview",
  );
});

test("พาดหัวเรื่องบาดเจ็บและเรื่อง AI แยกออกจากกัน", () => {
  assert.equal(classifyArticleTopic("กองหน้าตัวหลักเจ็บยาว รอลุ้นความฟิต"), "injury");
  assert.equal(classifyArticleTopic("AI ทายแม่นกว่าคนจริงหรือ?"), "predictions");
});

test("พาดหัวจริงจากหน้าเว็บต้องไม่ตกไปหมวด general โดยไม่จำเป็น", () => {
  // ทั้งสามอันนี้เคยตกไป general เพราะใช้คำที่ยังไม่อยู่ในลิสต์ ("สรุปศึก", "นำฝูง", "เปิดฉาก")
  assert.equal(
    classifyArticleTopic("เซบีย่าและเบติสพุ่งนำฝูง! สรุปศึกลาลีกา"),
    "match",
  );
  assert.equal(
    classifyArticleTopic("เปิดฉากพรีเมียร์ลีก 2026/27 เดือดสะใจ"),
    "preview",
  );
  assert.equal(
    classifyArticleTopic("ไบรท์ตันนำฝูงพรีเมียร์ลีกหลังจบสัปดาห์แรก"),
    "standings",
  );
});

test("พาดหัวที่ไม่เข้าหมวดไหนเลย ใช้ย่อหน้าแรกช่วยตัดสิน", () => {
  assert.equal(classifyArticleTopic("สวัสดีแฟนบอลทุกท่าน"), "general");
  assert.equal(
    classifyArticleTopic(
      "สวัสดีแฟนบอลทุกท่าน",
      "วันนี้ตลาดซื้อขายนักเตะร้อนแรงมาก มีดีลใหญ่รออยู่หลายราย",
    ),
    "transfer",
  );
});

test("คำค้นเอาชื่อทีมจากพาดหัวขึ้นก่อน แล้วจบด้วยคำค้นกลาง ๆ เสมอ", () => {
  const queries = coverSearchQueries(
    "transfer",
    "Premier League",
    "ส่องดีล Man City ซัมเมอร์นี้",
  );

  assert.match(queries[0], /Man City/);
  assert.match(queries.at(-1) ?? "", /football news$/);
  assert.ok(queries.some((q) => /transfer/i.test(q)));
});

test("พาดหัวที่เอ่ยสองทีม ต้องได้คำค้น \"A vs B\" มาก่อนคำค้นกลาง ๆ", () => {
  const queries = coverSearchQueries(
    "match",
    "Premier League",
    "เรือใบสีฟ้าโชว์โหดถล่มพาเลซ นำจ่าฝูงพรีเมียร์ลีก",
  );

  assert.equal(queries[0], "Manchester City vs Crystal Palace");
  assert.match(queries.at(-1) ?? "", /football news$/);
});

test("พาดหัวที่เอ่ยทีมเดียว ต้องได้คำค้นชื่อทีมบวกมุมของบทความ", () => {
  const queries = coverSearchQueries(
    "transfer",
    "La Liga",
    "บาร์ซ่าทุ่มคว้าตัวกองหน้าใหม่",
  );

  assert.equal(queries[0], "Barcelona transfer news");
});

test("คำค้น Pexels ห้ามมีคำว่า football เด็ดขาด", () => {
  // Pexels เป็นคลังภาพฝั่งอเมริกา "football" ที่นั่นคืออเมริกันฟุตบอล
  // เคยหลุดมาแล้วจนได้ถ้วยรักบี้กับบาสมาเป็นหน้าปกข่าวลาลีกา
  for (const topic of ALL_TOPICS) {
    for (const query of pexelsQueries(topic)) {
      assert.doesNotMatch(query, /football/i, `${topic}: "${query}"`);
      assert.doesNotMatch(query, /premier league|la liga|manchester|arsenal/i);
    }
  }
});

test("ทุกหมวดต้องมีคำค้นหลายอัน ไม่งั้นบทความในหมวดเดียวกันจะได้ภาพซ้ำ", () => {
  for (const topic of ALL_TOPICS) {
    const queries = pexelsQueries(topic);
    assert.ok(queries.length >= 3, `${topic} มีแค่ ${queries.length} คำค้น`);
    assert.equal(new Set(queries).size, queries.length, `${topic} มีคำค้นซ้ำ`);
  }
});

test("คำค้น Pexels ของ transfer กับ match ต้องไม่ใช่ชุดเดียวกัน", () => {
  assert.notDeepEqual(pexelsQueries("transfer"), pexelsQueries("match"));
});

test("pickBySeed: seed เดิมได้ผลเดิมเสมอ แต่ seed ต่างกันกระจายออก", () => {
  const items = ["a", "b", "c", "d"];

  // ใบเดิมต้องได้ภาพเดิมทุกครั้งที่รัน backfill ซ้ำ ไม่งั้นหน้าเว็บเปลี่ยนภาพไปมาเอง
  assert.equal(pickBySeed(items, "พาดหัวหนึ่ง"), pickBySeed(items, "พาดหัวหนึ่ง"));

  const picked = new Set(
    ["หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด"].map((seed) =>
      pickBySeed(items, seed),
    ),
  );
  assert.ok(picked.size > 1, "seed ต่างกันแล้วยังได้ตัวเดิมหมด แปลว่าไม่กระจาย");
});

test("พาดหัวไทยหลายอันในหมวดเดียวกันต้องกระจายไปหลายคำค้น ไม่กระจุกที่อันเดียว", () => {
  // เคสจริง: hash ต่างกันหมดแต่ % 4 ได้เลขเดียวกันทั้งสี่ใบ เพราะ FNV-1a เพียว ๆ
  // กระจายบิตล่างไม่ดี ซึ่งเป็นบิตที่ % ใช้พอดี
  const titles = [
    "เรือใบสีฟ้าโชว์โหดถล่มพาเลซ นำจ่าฝูงพรีเมียร์ลีก",
    "ราชันบดเรอัล โซเซียดัด! สรุปผลลาลีกาสุดเดือด",
    "ราชันชุดขาวถล่มโหด! สรุปผลลาลีกาและความเดือดตารางคะแนน",
    "เซบีย่าและเบติสพุ่งนำฝูง! สรุปศึกลาลีกา",
  ];
  const firstQueries = new Set(
    titles.map((title) => pexelsQueriesFor("match", title)[0]),
  );
  assert.ok(
    firstQueries.size >= 3,
    `สี่พาดหัวได้คำค้นแค่ ${firstQueries.size} แบบ — hash กระจุก`,
  );
});

test("พาดหัวสองอันที่เคยชนกันต้องไม่ได้ทั้งคำค้นและรูปใบเดียวกัน", () => {
  // เคสจริงตอนใช้ hash แบบผลรวมรหัสอักขระ: สองใบนี้ได้ "soccer tackle duel match"
  // กับรูปใบที่ 15 เหมือนกันเป๊ะ ทั้งที่เป็นคนละบทความ
  const a = "ราชันชุดขาวถล่มโหด! สรุปผลลาลีกาและความเดือดตารางคะแนน";
  const b = "เซบีย่าและเบติสพุ่งนำฝูง! สรุปศึกลาลีกา";
  const photos = Array.from({ length: 20 }, (_, i) => `photo${i}`);

  const keyOf = (title: string) =>
    `${pexelsQueriesFor(classifyArticleTopic(title), title)[0]}|${pickBySeed(photos, `${title}#photo`)}`;

  assert.notEqual(keyOf(a), keyOf(b));
});

test("pexelsQueriesFor: คืนคำค้นครบทุกอัน แต่เริ่มคนละจุดตามพาดหัว", () => {
  const rotated = pexelsQueriesFor("match", "ราชันชุดขาวถล่มโหด");
  assert.deepEqual([...rotated].sort(), [...pexelsQueries("match")].sort());

  const starts = new Set(
    ["หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก"].map(
      (seed) => pexelsQueriesFor("match", seed)[0],
    ),
  );
  assert.ok(starts.size > 1, "ทุกพาดหัวเริ่มจากคำค้นเดียวกัน = ยังได้ภาพซ้ำอยู่ดี");
});

test("isPexelsImageUrl แยกรูปของ Pexels ออกจากรูปแหล่งอื่น", () => {
  assert.equal(
    isPexelsImageUrl("https://images.pexels.com/photos/1/pexels-photo.jpeg"),
    true,
  );
  assert.equal(isPexelsImageUrl("https://images.unsplash.com/photo-123"), false);
  assert.equal(isPexelsImageUrl("ไม่ใช่ URL"), false);
  // กัน host ปลอม: ทั้งแบบเอาไปเป็น prefix ของโดเมนอื่น และแบบเติมท้ายชื่อ
  assert.equal(isPexelsImageUrl("https://pexels.com.attacker.net/x.jpg"), false);
  assert.equal(isPexelsImageUrl("https://evilpexels.com/x.jpg"), false);
});

test("vs banner: เข้ารหัสแล้วถอดกลับได้ครบ แม้ URL โลโก้มีอักขระพิเศษ", () => {
  const home = "https://crests.football-data.org/65.png?v=1&x=2";
  const away = "https://crests.football-data.org/354.svg";

  const parsed = parseVsBannerUrl(vsBannerUrl(home, away));
  assert.deepEqual(parsed, { homeCrest: home, awayCrest: away });
});

test("parseVsBannerUrl ปฏิเสธของที่ไม่ใช่ banner โดยไม่โยน error", () => {
  assert.equal(parseVsBannerUrl("https://example.com/photo.jpg"), null);
  assert.equal(parseVsBannerUrl("vs://มั่ว"), null);
  assert.equal(parseVsBannerUrl("vs://a"), null);
});
