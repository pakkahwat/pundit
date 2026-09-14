// ส่วนที่เป็นตรรกะล้วน ๆ ของคอลัมน์ประจำวัน — แยกออกมาจาก article.ts โดยตั้งใจ
//
// เหตุผล: article.ts ต้อง import getCurrentMatchday ซึ่งลากเอา @/db/client ตามมาด้วย และไฟล์นั้น
// throw ทันทีตอน import ถ้าไม่มี DATABASE_URL — พอ TypeScript คอมไพล์เป็น CJS มันจะยก require()
// ทุกตัวขึ้นไปไว้บนสุดของไฟล์ ก่อนคำสั่งอื่นทั้งหมด เทสต์จึงตั้ง env เองไม่ทัน (ต่อให้เขียนไว้บรรทัดแรก)
//
// ไฟล์นี้ import ได้เฉพาะโมดูลตรรกะล้วนด้วยกันเอง (ห้ามแตะ db/client) จึงเทสต์ได้
// โดยไม่ต้องมีฐานข้อมูลหรือ .env.local
import { sameTeam } from "@/lib/football/team-name";

// ── ภาพหน้าปกสำรอง ────────────────────────────────────────────────────────────
//
// ใช้เมื่อ RSS ไม่ได้แนบรูปมา หรือรูปที่แนบมาเป็นโลโก้ทีม (ดู isTeamCrestUrl ใน article-card.tsx)
// รวมไว้ที่เดียวเพราะเดิมลิสต์ชุดนี้ถูกก๊อปไว้สามที่ — ที่นี่, article-card.tsx และสคริปต์ backfill
// พอแก้ที่เดียวอีกสองที่ก็ค้างของเก่าไว้โดยไม่มีอะไรเตือน
const STADIUM_WIDE =
  "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80";
const CROWD =
  "https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=1200&q=80";
const PITCH =
  "https://images.unsplash.com/photo-1552318965-6e6be7484ad6?auto=format&fit=crop&w=1200&q=80";
const PLAYER_CLOSEUP =
  "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&w=1200&q=80";

/** ข่าวเกม — ใช้ภาพกว้างระดับสนาม */
export const MATCH_BANNER_IMAGES = [STADIUM_WIDE, CROWD, PITCH];
/** ข่าวตัวบุคคล (ย้ายทีม/บาดเจ็บ) — ใช้ภาพที่โฟกัสนักเตะมากกว่า */
export const PLAYER_FOCUS_IMAGES = [PLAYER_CLOSEUP, STADIUM_WIDE, CROWD];
/** ชุดที่เก็บลง articles.cover_image_urls เมื่อไม่มีรูปจากข่าวจริง */
export const DEFAULT_ARTICLE_COVER_IMAGES = [
  STADIUM_WIDE,
  CROWD,
  PITCH,
  PLAYER_CLOSEUP,
];

export type ArticleSource = {
  date: string;
  seasonName: string;
  currentMatchday: number | null;
  recentResults: {
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    kickoffAt: string;
  }[];
  upcomingMatches: { homeTeam: string; awayTeam: string; kickoffAt: string }[];
  standings: {
    rank: number;
    team: string;
    played: number;
    points: number;
    goalDiff: number;
  }[];
  predictorAccuracy: {
    name: string | null;
    isAi: boolean;
    scored: number;
    correct: number;
  }[];
  externalNews: {
    title: string;
    url?: string;
    source?: string;
    imageUrl?: string;
  }[];
  // ภาพหน้าปกแบบฟุตบอลจริง ไม่ใช่โลโก้ทีม เพื่อให้บรรยากาศข่าวดูเป็นสื่อฟุตบอลมากกว่าแบรนด์ทีม
  coverImageUrls: string[];
};

export type StorySeed = {
  label: string;
  evidence: string[];
};

// ── พรีวิวก่อนแมตช์เดย์ ───────────────────────────────────────────────────────
//
// บทความอีกชนิดหนึ่ง (articles.kind = 'preview') เขียนเมื่อเหลือไม่ถึง 48 ชม.ก่อนนัดแรกของ
// แมตช์เดย์ ข้อมูลที่ให้โมเดลคือโปรแกรม ฟอร์ม ตาราง และสถิติพบกัน — ล้วนเป็นสิ่งที่คนทายเห็นได้เอง
// อยู่แล้วบนเว็บ **จงใจไม่ใส่คำทายของ AI ตัวไหนเลย** เพราะบทความออกก่อนคิกออฟ ถ้ามีคำทาย AI
// หลุดไป คนก็แค่ทายตาม แล้วคำถาม "คนแม่นกว่า AI ไหม" จะตอบไม่ได้อีกเลย
export type ArticleKind = "daily" | "preview";

export type PreviewFixture = {
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string; // ISO
  /** ฟอร์ม 5 นัดหลังสุด ล่าสุดอยู่ซ้าย เช่น "W W D L W" — ว่าง = ยังไม่มีข้อมูล */
  homeForm: string;
  awayForm: string;
  homeRank: number | null;
  awayRank: number | null;
  homePoints: number | null;
  awayPoints: number | null;
  /** ผลเจอกัน 3 นัดหลังสุด เช่น "Arsenal 2-1 Chelsea · Chelsea 0-0 Arsenal" */
  headToHead: string;
};

export type PreviewSource = {
  kind: "preview";
  date: string;
  seasonName: string;
  matchday: number;
  fixtures: PreviewFixture[];
  standings: ArticleSource["standings"];
  predictorAccuracy: ArticleSource["predictorAccuracy"];
};

/** เวลาเตะแบบไทย สั้น ๆ สำหรับป้ายบนแบนเนอร์และ prompt เช่น "ส. 20 ก.ย. 21:00" */
export function formatKickoffThai(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// ประโยคที่ถือว่า "ชี้นำผล" ในพรีวิว — จงใจให้แคบ (ต้องบอกว่าใครจะชนะ/ควรทายอะไร) ไม่จับคำกลาง ๆ
// อย่าง "น่าจะสนุก" หรือ "ลุ้น" เพราะเจอบ่อยในภาษาคอลัมน์และไม่ได้บอกใบ้ผล ถ้าจับกว้างเกินไป
// พรีวิวจะถูกตีกลับทุกวันจนไม่มีพรีวิวเลย
const TIP_PATTERN =
  /ฟันธง|ทายว่า|ควรทาย|แนะนำให้ทาย|เชียร์ให้ทาย|ตัวเต็ง|เต็งหนึ่ง|น่าจะ ?(ชนะ|เอาชนะ|คว้าชัย|เก็บ ?(สาม|3) ?แต้ม)|มีโอกาสชนะ ?(สูง|มาก)|ชนะได้ไม่ยาก|ชนะแน่/;

/** พรีวิวข้อความนี้บอกใบ้ผลหรือเปล่า (ใช้ตีกลับก่อนเผยแพร่ ดู jobs/article.ts) */
export function looksLikeTip(text: string): boolean {
  return TIP_PATTERN.test(text);
}

/** ข้อความที่ส่งให้โมเดลเขียนพรีวิว — ข้อมูลล้วน ไม่มีคำทายของใคร */
export function formatPreviewSource(src: PreviewSource): string {
  const fixtures =
    src.fixtures.length > 0
      ? src.fixtures
          .map((f) => {
            const rank = (r: number | null, p: number | null) =>
              r === null ? "ยังไม่มีอันดับ" : `อันดับ ${r}${p === null ? "" : ` (${p} แต้ม)`}`;
            return [
              `${f.homeTeam} พบ ${f.awayTeam} — เตะ ${formatKickoffThai(f.kickoffAt)} (เวลาไทย)`,
              `  ${f.homeTeam}: ${rank(f.homeRank, f.homePoints)} · ฟอร์ม ${f.homeForm || "ยังไม่มีข้อมูล"}`,
              `  ${f.awayTeam}: ${rank(f.awayRank, f.awayPoints)} · ฟอร์ม ${f.awayForm || "ยังไม่มีข้อมูล"}`,
              `  เจอกันล่าสุด: ${f.headToHead || "ยังไม่เคยเจอกันในข้อมูลที่มี"}`,
            ].join("\n");
          })
          .join("\n\n")
      : "ยังไม่มีโปรแกรมของแมตช์เดย์นี้";

  const table =
    src.standings.length > 0
      ? src.standings
          .map(
            (s) =>
              `${s.rank}. ${s.team} — ${s.points} แต้ม จาก ${s.played} นัด (ผลต่าง ${s.goalDiff})`,
          )
          .join("\n")
      : "ยังไม่มีตารางคะแนน";

  const accuracy =
    src.predictorAccuracy.length > 0
      ? src.predictorAccuracy
          .map(
            (a) =>
              `${a.name}${a.isAi ? " (AI)" : ""} — ทายถูก ${a.correct} จาก ${a.scored} นัด`,
          )
          .join("\n")
      : "ยังไม่มีใครถูกคิดคะแนน";

  return `วันที่: ${src.date}
ฤดูกาล: ${src.seasonName} — พรีวิวแมตช์เดย์ ${src.matchday}

โปรแกรมแข่งของแมตช์เดย์นี้ (ฟอร์ม = 5 นัดหลังสุด ล่าสุดอยู่ซ้าย):
${fixtures}

ตารางคะแนนก่อนแมตช์เดย์ (6 อันดับแรก):
${table}

สถานการณ์ในลีกทายผล Pundit ก่อนแมตช์เดย์นี้:
${accuracy}`;
}

function decodeRssHtml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseRssItems(
  xml: string,
): { title: string; url?: string; source?: string; imageUrl?: string }[] {
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];

  return items
    .map((match) => {
      const itemXml = match[1];
      const titleMatch = itemXml.match(
        /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i,
      );
      const linkMatch = itemXml.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i);
      const sourceMatch = itemXml.match(
        /<source(?:\s[^>]*)?>([\s\S]*?)<\/source>/i,
      );
      const title = (titleMatch?.[1] ?? "")
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .replace(/<[^>]+>/g, "")
        .trim();
      const url = (linkMatch?.[1] ?? "")
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .replace(/<[^>]+>/g, "")
        .trim();
      const source = (sourceMatch?.[1] ?? "")
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .replace(/<[^>]+>/g, "")
        .trim();
      const descriptionMatch = itemXml.match(
        /<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i,
      );
      const decodedDescription = decodeRssHtml(descriptionMatch?.[1] ?? "");
      const imageUrl =
        itemXml.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[1] ??
        itemXml.match(/<enclosure[^>]+url=["']([^"']+)["']/i)?.[1] ??
        itemXml.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ??
        decodedDescription.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
      const normalizedImageUrl = imageUrl?.startsWith("//")
        ? `https:${imageUrl}`
        : imageUrl;

      return title
        ? {
            title,
            url: url || undefined,
            source: source || undefined,
            imageUrl: normalizedImageUrl || undefined,
          }
        : undefined;
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .slice(0, 5);
}

export function buildStorySeeds(src: ArticleSource): StorySeed[] {
  const topTable = src.standings.slice(0, 4);
  const highestScoring = [...src.recentResults]
    .filter((r) => r.homeScore !== null && r.awayScore !== null)
    .sort((a, b) => {
      const totalA = (a.homeScore ?? 0) + (a.awayScore ?? 0);
      const totalB = (b.homeScore ?? 0) + (b.awayScore ?? 0);
      return totalB - totalA;
    })
    .slice(0, 2);
  const upcoming = src.upcomingMatches.slice(0, 3);
  const predictors = src.predictorAccuracy.slice(0, 3);
  const external = src.externalNews.slice(0, 2);

  const seeds: StorySeed[] = [
    {
      label: "จุดเดือดบนตารางคะแนน",
      evidence:
        topTable.length > 0
          ? topTable.map(
              (team) =>
                `${team.rank}. ${team.team} — ${team.points} แต้ม จาก ${team.played} นัด, ผลต่างประตู ${team.goalDiff}`,
            )
          : ["ยังไม่มีข้อมูลตารางคะแนนเพียงพอ"],
    },
    {
      label: "ผลการแข่งขันล่าสุดที่สร้างความเคลื่อนไหว",
      evidence:
        src.recentResults.length > 0
          ? src.recentResults
              .slice(0, 3)
              .map(
                (match) =>
                  `${match.homeTeam} ${match.homeScore ?? 0}-${match.awayScore ?? 0} ${match.awayTeam}`,
              )
          : ["ยังไม่มีนัดที่จบแล้วในช่วงนี้"],
    },
    {
      label: "นัดสำคัญที่กำลังรออยู่",
      evidence:
        upcoming.length > 0
          ? upcoming.map((match) => `${match.homeTeam} พบ ${match.awayTeam}`)
          : ["ยังไม่มีโปรแกรมนัดถัดไป"],
    },
    {
      label: "การแข่งขันของคนทายผลกับ AI",
      evidence:
        predictors.length > 0
          ? predictors.map(
              (person) =>
                `${person.name ?? "ผู้ทายไร้ชื่อ"} ${person.isAi ? "(AI)" : "(คนจริง)"} ทายถูก ${person.correct} จาก ${person.scored} นัด`,
            )
          : ["ยังไม่มีข้อมูลความแม่นยำ"],
    },
    {
      label: "เกมที่มีโอกาสเปลี่ยนภาพตาราง",
      evidence:
        highestScoring.length > 0
          ? highestScoring.map(
              (match) =>
                `${match.homeTeam} ${match.homeScore ?? 0}-${match.awayScore ?? 0} ${match.awayTeam} — ผลรวม ${(match.homeScore ?? 0) + (match.awayScore ?? 0)} ประตู`,
            )
          : ["ยังไม่มีนัดที่มีสกอร์สูงพอจะนำมาเล่า"],
    },
    {
      label: "ข่าวฟุตบอลรอบวันที่เกี่ยวกับลีก",
      evidence:
        external.length > 0
          ? external.map((item) => item.title)
          : ["ยังไม่มีข่าวฟุตบอลภายนอกที่เกี่ยวข้องกับลีกในวันนี้"],
    },
  ];

  if (
    src.recentResults.length === 0 &&
    src.upcomingMatches.length === 0 &&
    external.length > 0
  ) {
    return [seeds[5], seeds[0], seeds[3], seeds[1], seeds[2], seeds[4]];
  }

  return seeds;
}

export function rotateSeedOrder<T>(items: T[], key: string): T[] {
  // เช็คความยาวก่อนหาร — ถ้า items ว่าง `% 0` จะได้ NaN แล้ว slice(NaN) เงียบ ๆ โดยไม่มีอะไรฟ้อง
  if (items.length <= 1) return items;
  const offset =
    Array.from(key).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) %
    items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

export type ResolvedFixture = { homeTeam: string; awayTeam: string };

type FixtureLike = { homeTeam: string; awayTeam: string };

/**
 * หาว่าทีมที่พาดหัวพูดถึง ตรงกับแมตช์ไหนในข้อมูลตั้งต้นของบทความ
 *
 * จุดประสงค์เดียวคือรู้ว่า "ใครเป็นเจ้าบ้าน" — ลำดับทีมในพาดหัวไทยเชื่อไม่ได้เลย
 * ("เรือใบสีฟ้าถล่มพาเลซ" เอาผู้ชนะขึ้นก่อน ไม่ใช่เจ้าบ้าน) แต่ recentResults/upcomingMatches
 * ใน source มาจากตาราง matches ของเราเอง ซึ่งรู้ฝั่งเหย้า/เยือนแน่นอน
 *
 * เทียบชื่อผ่าน sameTeam เพราะชื่อในตารางฉายา ("Manchester City") กับชื่อใน DB
 * ("Manchester City FC") ไม่ตรงกันตัวอักษร — คืน null เมื่อหาไม่เจอ ผู้เรียกค่อยเดาเอาเอง
 */
export function resolveFixture(
  teams: string[],
  src: {
    recentResults?: FixtureLike[];
    upcomingMatches?: FixtureLike[];
    /** โปรแกรมของพรีวิว (PreviewSource) — นับเป็นนัดข้างหน้าเหมือน upcomingMatches */
    fixtures?: FixtureLike[];
    // ฟิลด์เหล่านี้อาจมาจาก source_snapshot เก่าที่ไม่มีฟิลด์ครบ จึงเป็น optional ทั้งหมด
  },
  options: { preferUpcoming?: boolean } = {},
): ResolvedFixture | null {
  if (teams.length === 0) return null;

  const recent = src.recentResults ?? [];
  const upcoming = [...(src.upcomingMatches ?? []), ...(src.fixtures ?? [])];
  // บทความ preview ชี้ไปเกมข้างหน้า ส่วนบทความสรุปผลชี้ไปเกมที่เพิ่งจบ — เรียงลิสต์ตามนั้น
  const fixtures = options.preferUpcoming
    ? [...upcoming, ...recent]
    : [...recent, ...upcoming];

  const involves = (fixture: FixtureLike, team: string) =>
    sameTeam(fixture.homeTeam, team) || sameTeam(fixture.awayTeam, team);

  const found =
    teams.length >= 2
      ? fixtures.find(
          (fixture) => involves(fixture, teams[0]) && involves(fixture, teams[1]),
        )
      : fixtures.find((fixture) => involves(fixture, teams[0]));

  return found ? { homeTeam: found.homeTeam, awayTeam: found.awayTeam } : null;
}

/** ทีมทั้งหมดที่โผล่ในข้อมูลตั้งต้นของบทความ — ใช้กรองไม่ให้ฉายาไทยไปจับทีมนอกลีกนั้น */
export function teamNamesFromSource(src: {
  recentResults?: { homeTeam: string; awayTeam: string }[];
  upcomingMatches?: { homeTeam: string; awayTeam: string }[];
  fixtures?: { homeTeam: string; awayTeam: string }[];
  standings?: { team: string }[];
}): string[] {
  return [
    ...new Set([
      ...(src.recentResults ?? []).flatMap((m) => [m.homeTeam, m.awayTeam]),
      ...(src.upcomingMatches ?? []).flatMap((m) => [m.homeTeam, m.awayTeam]),
      ...(src.fixtures ?? []).flatMap((m) => [m.homeTeam, m.awayTeam]),
      ...(src.standings ?? []).map((s) => s.team),
    ]),
  ];
}

/**
 * ของประกอบแบนเนอร์ที่มาจาก DB ล้วน ๆ: สกอร์ (บทความสรุปผล) หรือเวลาเตะ (พรีวิว) ของแมตช์ที่บทความ
 * ผูกไว้ — ใช้ทั้งตอนสร้างบทความและตอน backfill จะได้ไม่มีสองมาตรฐาน
 */
export function coverExtrasFor(
  topic: string,
  src: {
    recentResults?: { homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null }[];
    upcomingMatches?: { homeTeam: string; awayTeam: string; kickoffAt: string }[];
    fixtures?: { homeTeam: string; awayTeam: string; kickoffAt: string }[];
  },
  fixture: ResolvedFixture | null,
): { score?: string; label?: string } {
  if (!fixture) return {};
  const isThis = (m: FixtureLike) =>
    sameTeam(m.homeTeam, fixture.homeTeam) && sameTeam(m.awayTeam, fixture.awayTeam);

  if (topic === "match") {
    const result = (src.recentResults ?? []).find(isThis);
    if (result && result.homeScore !== null && result.awayScore !== null) {
      return { score: `${result.homeScore}-${result.awayScore}` };
    }
    return {};
  }
  if (topic === "preview") {
    const upcoming = [...(src.upcomingMatches ?? []), ...(src.fixtures ?? [])].find(isThis);
    const when = upcoming ? formatKickoffThai(upcoming.kickoffAt) : "";
    return { label: when ? `พรีวิว · ${when}` : "พรีวิว" };
  }
  return {};
}

/**
 * เอาชื่อทีมที่โมเดลบอกว่าเป็น "ทีมหลักของบทความ" มาเทียบกับชื่อจริงใน source — โมเดลอาจสะกด
 * ต่างไปนิดหน่อย ("Man City" / "Manchester City") จึงเทียบผ่าน sameTeam แล้วคืนชื่อตามที่ DB ใช้
 * ชื่อที่หาไม่เจอถูกทิ้ง เพื่อไม่ให้โมเดลลากทีมนอกลีก (จากความจำของมัน) เข้ามาในแบนเนอร์
 */
export function resolveFocusTeams(
  focusTeams: string[] | undefined,
  knownTeams: string[],
): string[] {
  if (!focusTeams) return [];
  const resolved: string[] = [];
  for (const name of focusTeams) {
    const hit = knownTeams.find((known) => sameTeam(known, name));
    if (hit && !resolved.includes(hit)) resolved.push(hit);
  }
  return resolved.slice(0, 2);
}
