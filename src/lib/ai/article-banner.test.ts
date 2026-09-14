import test from "node:test";
import assert from "node:assert/strict";

import {
  TOPIC_LABEL,
  bannerUrl,
  isBannerUrl,
  parseBannerUrl,
  toPexelsQuery,
  vsBannerUrl,
} from "./article-cover";

test("banner: เข้ารหัสแล้วถอดกลับได้ครบทุกช่อง รวม URL ที่มี query string", () => {
  const banner = {
    bg: "https://upload.wikimedia.org/x/1280px-Stadium.jpg?utm=1",
    homeCrest: "https://crests.football-data.org/57.png",
    awayCrest: "https://crests.football-data.org/61.png",
    score: "3-1",
    label: "สรุปผล",
  };
  const url = bannerUrl(banner);
  assert.ok(isBannerUrl(url));
  assert.deepEqual(parseBannerUrl(url), { ...banner, crest: undefined });
});

test("banner: ช่องว่างถูกตัดทิ้ง และของเสีย/ว่างเปล่าคืน null", () => {
  assert.deepEqual(parseBannerUrl(bannerUrl({ label: "พรีวิว", bg: "" })), {
    bg: undefined,
    homeCrest: undefined,
    awayCrest: undefined,
    score: undefined,
    label: "พรีวิว",
    crest: undefined,
  });
  assert.equal(parseBannerUrl(bannerUrl({})), null);
  assert.equal(parseBannerUrl("banner://%7Bnot-json"), null);
  assert.equal(parseBannerUrl("https://example.com/a.jpg"), null);
});

test("isBannerUrl รู้จักทั้ง banner:// ใหม่และ vs:// เดิม", () => {
  assert.ok(isBannerUrl(vsBannerUrl("https://a/h.png", "https://a/a.png")));
  assert.equal(isBannerUrl("https://images.pexels.com/x.jpg"), false);
});

test("ทุกหมวดมีป้ายไทย", () => {
  for (const label of Object.values(TOPIC_LABEL)) assert.ok(label.length > 0);
});

test("toPexelsQuery: ขึ้นต้นด้วย soccer เสมอ แทน football และตัดอักขระแปลก", () => {
  assert.equal(
    toPexelsQuery("Football players celebrating a late goal, floodlights!"),
    "soccer players celebrating a late goal floodlights",
  );
  assert.equal(toPexelsQuery("soccer stadium empty seats"), "soccer stadium empty seats");
  assert.equal(toPexelsQuery("  "), null);
  assert.equal(toPexelsQuery(undefined), null);
  // ยาวเกินถูกตัดเหลือ 8 คำ
  assert.equal(
    toPexelsQuery("one two three four five six seven eight nine ten")?.split(" ").length,
    8,
  );
});
