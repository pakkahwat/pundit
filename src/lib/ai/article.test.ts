import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStorySeeds,
  parseRssItems,
  resolveFixture,
  type ArticleSource,
} from "./article-source";

const sampleSource: ArticleSource = {
  date: "2026-08-27",
  seasonName: "Premier League",
  currentMatchday: 4,
  recentResults: [
    {
      homeTeam: "Arsenal",
      awayTeam: "Liverpool",
      homeScore: 2,
      awayScore: 1,
      kickoffAt: "2026-08-26T19:00:00Z",
    },
    {
      homeTeam: "Chelsea",
      awayTeam: "Tottenham",
      homeScore: 1,
      awayScore: 1,
      kickoffAt: "2026-08-25T19:00:00Z",
    },
    {
      homeTeam: "Man City",
      awayTeam: "Leeds",
      homeScore: 3,
      awayScore: 0,
      kickoffAt: "2026-08-24T19:00:00Z",
    },
  ],
  upcomingMatches: [
    {
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      kickoffAt: "2026-08-30T19:00:00Z",
    },
    {
      homeTeam: "Liverpool",
      awayTeam: "Man City",
      kickoffAt: "2026-08-31T18:30:00Z",
    },
  ],
  standings: [
    { rank: 1, team: "Arsenal", played: 4, points: 12, goalDiff: 8 },
    { rank: 2, team: "Liverpool", played: 4, points: 10, goalDiff: 5 },
    { rank: 3, team: "Chelsea", played: 4, points: 9, goalDiff: 2 },
  ],
  predictorAccuracy: [
    { name: "Alice", isAi: false, scored: 8, correct: 6 },
    { name: "Bot 7", isAi: true, scored: 8, correct: 5 },
  ],
  externalNews: [
    {
      title: "La Liga transfer tracker: club set to make a late move",
      source: "Google News",
    },
    {
      title: "Spanish clubs push for a busy weekend of fixtures",
      source: "Google News",
    },
  ],
  coverImageUrls: ["https://example.com/crest.png"],
};

test("buildStorySeeds creates multiple different article angles from real data", () => {
  const seeds = buildStorySeeds(sampleSource);

  assert.ok(seeds.length >= 3, "should generate multiple angles");
  assert.ok(
    seeds.some(
      (seed) =>
        seed.label.includes("ตาราง") ||
        seed.label.includes("ผลการแข่งขัน") ||
        seed.label.includes("นัดสำคัญ") ||
        seed.label.includes("ผู้ทาย") ||
        seed.label.includes("ข่าวฟุตบอล"),
    ),
  );
  assert.ok(
    seeds.some(
      (seed) =>
        seed.label.includes("นัด") ||
        seed.label.includes("ตาราง") ||
        seed.label.includes("ข่าวฟุตบอล"),
    ),
  );
  assert.ok(
    seeds.some(
      (seed) => seed.label.includes("AI") || seed.label.includes("ผู้ทาย"),
    ),
  );
  assert.ok(seeds.every((seed) => seed.evidence.length > 0));
});

test("buildStorySeeds leads with external news when there are no current fixtures", () => {
  const seeds = buildStorySeeds({
    ...sampleSource,
    recentResults: [],
    upcomingMatches: [],
  });

  assert.equal(seeds[0]?.label, "ข่าวฟุตบอลรอบวันที่เกี่ยวกับลีก");
  assert.match(seeds[0]?.evidence[0] ?? "", /transfer|clubs/i);
});

test("parseRssItems keeps the source article image", () => {
  const [item] = parseRssItems(`
    <rss><channel><item>
      <title>Premier League transfer update</title>
      <link>https://example.com/story</link>
      <source>Example News</source>
      <media:content url="https://example.com/football.jpg" type="image/jpeg" />
    </item></channel></rss>
  `);

  assert.equal(item?.imageUrl, "https://example.com/football.jpg");
});

test("parseRssItems extracts encoded Google News thumbnail images", () => {
  const [item] = parseRssItems(`
    <rss><channel><item>
      <title>Premier League injury update</title>
      <link>https://news.google.com/rss/articles/example</link>
      <description>&lt;a href=&quot;https://example.com/story&quot;&gt;&lt;img src=&quot;//lh3.googleusercontent.com/football-image&quot;&gt;&lt;/a&gt;</description>
    </item></channel></rss>
  `);

  assert.equal(
    item?.imageUrl,
    "https://lh3.googleusercontent.com/football-image",
  );
});

test("resolveFixture: รู้เจ้าบ้านจริงจาก DB แม้พาดหัวเอาผู้ชนะขึ้นก่อน", () => {
  // พาดหัว "ลิเวอร์พูลบุกถล่มอาร์เซนอล" เอ่ยลิเวอร์พูลก่อน แต่เกมจริงอาร์เซนอลเป็นเจ้าบ้าน
  const fixture = resolveFixture(["Liverpool", "Arsenal"], sampleSource);
  assert.deepEqual(fixture, { homeTeam: "Arsenal", awayTeam: "Liverpool" });
});

test("resolveFixture: ทีมเดียวก็หาแมตช์ของทีมนั้นเจอ และ preview เลือกเกมข้างหน้าก่อน", () => {
  assert.deepEqual(resolveFixture(["Chelsea"], sampleSource), {
    homeTeam: "Chelsea",
    awayTeam: "Tottenham",
  });
  // Arsenal มีทั้งเกมที่จบแล้ว (พบ Liverpool) และเกมข้างหน้า (พบ Chelsea)
  assert.deepEqual(
    resolveFixture(["Arsenal"], sampleSource, { preferUpcoming: true }),
    { homeTeam: "Arsenal", awayTeam: "Chelsea" },
  );
});

test("resolveFixture: หาไม่เจอหรือไม่มีทีมให้หา คืน null เฉย ๆ", () => {
  assert.equal(resolveFixture([], sampleSource), null);
  assert.equal(resolveFixture(["Real Madrid"], sampleSource), null);
  assert.equal(
    resolveFixture(["Arsenal"], { recentResults: [], upcomingMatches: [] }),
    null,
  );
});
