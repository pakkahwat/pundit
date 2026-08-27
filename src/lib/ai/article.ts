import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import type postgres from "postgres";
import { z } from "zod";
import { getCurrentMatchday } from "@/lib/matches/current-matchday";

// บทความรายวันที่ AI เขียน — หลักการสำคัญ: ให้โมเดลเขียนจาก "ข้อมูลที่เราส่งให้เท่านั้น" ซึ่งดึงมา
// จาก DB ของเราเองล้วน ๆ ไม่ใช่ให้มันนึกข่าวจากความจำ เพราะความจำของโมเดลมีวันหมดอายุและแต่งเรื่อง
// ขึ้นมาเองได้ ส่วนตัวเลขใน DB เราตรวจย้อนกลับได้ทุกตัว

const articleSchema = z.object({
  title: z.string().describe("พาดหัวภาษาไทย สั้น กระชับ ไม่เกิน 60 ตัวอักษร"),
  body: z
    .string()
    .describe(
      "เนื้อหาภาษาไทยแบบ markdown ความยาว 3-5 ย่อหน้า เขียนเป็นความเรียง ห้ามใช้ bullet point",
    ),
});

const SYSTEM_PROMPT = `คุณเป็นนักเขียนคอลัมน์ฟุตบอลของเว็บ "Pundit" สำหรับทุกลีกที่มีในระบบ
ที่มีทั้งคนจริงและ AI แข่งทายผลกัน หน้าที่ของคุณคือเขียนบทความประจำวันสำหรับลีกนี้จากข้อมูลที่ได้รับ

กฎเหล็ก: เขียนได้เฉพาะสิ่งที่อยู่ในข้อมูลที่ให้มาเท่านั้น ห้ามเพิ่มข้อเท็จจริงใด ๆ จากความรู้ของคุณเอง
ไม่ว่าจะเป็นชื่อนักเตะ อาการบาดเจ็บ ข่าวย้ายทีม คำพูดของโค้ช หรือสถิติที่ไม่ได้ระบุไว้ เพราะข้อมูล
เหล่านั้นอาจไม่ตรงกับความจริง ณ ปัจจุบัน ถ้าข้อมูลมีน้อยก็เขียนสั้นได้ ไม่ต้องแต่งเติมให้ยาว

ลำดับความสำคัญของหัวข้อสำหรับแต่ละลีก (ให้ปฏิบัติตามนี้เสมอ):
1. ถ้ามีแมตช์ที่จบลงแล้วในวันนั้นหรือภายใน 48 ชั่วโมงที่ผ่านมา ให้เล่าเรื่องจากแมตช์นั้นก่อน ไม่ว่าจะมี 1 คู่หรือหลายคู่
2. ถ้ามีแมตช์ที่จะเริ่มภายในวันนี้ ให้หยิบเรื่องความสำคัญของแมตช์นั้นมาเป็นจุดสนใจ
3. ถ้าไม่มีแมตช์ที่น่าจะเล่าในวันนั้น หรือลีกนั้นหยุดช่วงกลางสัปดาห์ ให้ย้ายไปใช้ประเด็นที่เป็นข่าวรอบวันที่เกี่ยวกับลีกนี้เป็นหลัก เช่น การย้ายทีม อาการบาดเจ็บ ความพร้อมของทีม หรือเรื่องที่อยู่ใน feed ข่าว
4. ถ้าไม่มีข่าวหรือประเด็นที่เข้มข้นพอ ให้ใช้ตารางคะแนนหรือฟอร์มล่าสุดเป็นจุดเริ่มต้น แต่ไม่ให้เป็นเรื่องหลักถ้าหมดเกมแล้ว
5. ถ้ามีเรื่องความแม่นของคนทายผลกับ AI ให้ใช้เป็นสีสัน แต่ไม่ให้มันกลายเป็นหัวข้อหลักเสมอ

กติกาเรื่องข่าวที่ไม่ใช่เกม:
- ข่าวย้ายทีม อาการบาดเจ็บ และเรื่องทีมที่เกี่ยวกับลีกนี้ สามารถนำมาเรียบเรียงเป็นบทความได้ หากช่วงนั้นไม่มีแมตช์แข่ง
- ให้เขียนถึงความหมายของข่าวนั้นต่อลีกและทีมที่เกี่ยวข้อง ไม่ใช่สรุปแบบข่าวสั้น ๆ อย่างเดียว
- ถ้า feed ข่าวไม่ใช่เรื่องที่เชื่อถือได้เต็ม 100% ให้สรุปเป็น "ประเด็นรอบวัน" หรือ "เรื่องที่คนในลีกกำลังจับตา" ไม่ใช่การยืนยันว่าเป็นความจริงแบบตายตัว
- สำหรับแต่ละลีก ให้เลือกเรื่องที่ตรงกับลีกนั้นจริง ๆ ไม่ใช่เอาเรื่องของพรีเมียร์ลีกไปเขียนให้ทุกลีก

ความหลากหลาย: อย่าเขียนบทความแบบสรุปผล-ตาราง-โปรแกรมซ้ำๆ กันทุกวัน ให้เลือก 1-2 มุมเล่าจาก
"ไอเดียเรื่องที่สามารถเลือกล่า" ที่ได้มาจากข้อมูลจริงเท่านั้น เช่น
- แมตช์ที่เพิ่งจบแล้วและมีผลกระทบต่ออันดับหรือแรงกดดัน
- นัดสำคัญที่กำลังจะมาถึงและมีผลต่อการไล่ล่าแชมป์/ตกชั้น
- สถานการณ์บนตารางคะแนนที่เปลี่ยนแปลง
- ข่าวย้ายทีม, อาการบาดเจ็บ, หรือความพร้อมของทีมในลีกนี้
- ข่าวฟุตบอลรอบวันที่เกี่ยวกับลีกนี้
- การทายผลคน vs AI ที่น่าสนใจ

อย่าต้องพูดทุกตัวเลขทุกวัน และไม่ควรเล่าแบบเดียวกันทุกครั้ง

น้ำเสียง: เป็นกันเอง สนุก มีอารมณ์ขันบ้าง แบบคอลัมนิสต์ฟุตบอลคุยกับเพื่อน ไม่ใช่รายงานข่าวแห้ง ๆ
ถ้ามีประเด็นที่ AI ทายพลาดหรือทายแม่นกว่าคน ให้หยิบมาเล่นเป็นสีสันได้ เพราะนั่นคือจุดขายของเว็บนี้`;

export const DEFAULT_ARTICLE_COVER_IMAGES = [
  "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1552318965-6e6be7484ad6?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&w=1200&q=80",
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

async function fetchExternalNews(
  seasonName: string,
): Promise<
  { title: string; url?: string; source?: string; imageUrl?: string }[]
> {
  const queries = [
    `${seasonName} transfer news`,
    `${seasonName} injury news`,
    `${seasonName} football news`,
    `${seasonName} latest news`,
    `${seasonName} squad update`,
    `${seasonName} team news`,
  ];

  for (const query of queries) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}`;

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!response.ok) continue;
      const xml = await response.text();
      const items = parseRssItems(xml);
      if (items.length > 0) return items;
    } catch {
      // หาก feed ล่ม ให้ข้ามไป query ถัดไป เพื่อไม่ให้ทั้งไลฟ์โค้ดพัง
    }
  }

  return [];
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

function rotateSeedOrder<T>(items: T[], key: string): T[] {
  const offset =
    Array.from(key).reduce((sum, ch) => sum + ch.charCodeAt(0), 0) %
    items.length;
  if (items.length <= 1) return items;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

// รวบรวมข้อมูลดิบสำหรับเขียนบทความ — ทุก query อิงจากข้อมูลที่เกิดขึ้นจริงใน DB แล้วเท่านั้น
export async function buildArticleSource(
  sql: postgres.Sql,
  seasonId: string,
  today: string,
): Promise<ArticleSource> {
  const [season] = await sql<{ name: string }[]>`
    select name from seasons where id = ${seasonId}
  `;
  // ใช้กติกาเดียวกับที่หน้าเว็บใช้ ไม่งั้นบทความจะเขียนเลขแมตช์เดย์ไม่ตรงกับที่ผู้อ่านเห็นบนเว็บ
  const currentMatchday = await getCurrentMatchday(seasonId, sql);

  const [recentResults, upcomingMatches, standings, accuracy, crests] =
    await Promise.all([
      sql<
        {
          home_team: string;
          away_team: string;
          home_score: number | null;
          away_score: number | null;
          kickoff_at: string;
        }[]
      >`
      select ht.name as home_team, at.name as away_team, m.home_score, m.away_score, m.kickoff_at
      from matches m
      join teams ht on ht.id = m.home_team_id
      join teams at on at.id = m.away_team_id
      where m.season_id = ${seasonId}
        and m.status = 'FINISHED'
        and m.kickoff_at >= ${today}::date - interval '2 days'
        and m.kickoff_at < ${today}::date + interval '1 day'
      order by m.kickoff_at desc
      limit 10
    `,
      sql<{ home_team: string; away_team: string; kickoff_at: string }[]>`
      select ht.name as home_team, at.name as away_team, m.kickoff_at
      from matches m
      join teams ht on ht.id = m.home_team_id
      join teams at on at.id = m.away_team_id
      where m.season_id = ${seasonId}
        and m.kickoff_at >= ${today}::date
        and m.kickoff_at < ${today}::date + interval '1 day'
      order by m.kickoff_at
      limit 10
    `,
      sql<{ team: string; played: number; points: number; gd: number }[]>`
      with team_matches as (
        select home_team_id as team_id, home_score as gf, away_score as ga,
          case when home_score > away_score then 3 when home_score = away_score then 1 else 0 end as pts
        from matches where season_id = ${seasonId} and status = 'FINISHED'
        union all
        select away_team_id as team_id, away_score as gf, home_score as ga,
          case when away_score > home_score then 3 when away_score = home_score then 1 else 0 end as pts
        from matches where season_id = ${seasonId} and status = 'FINISHED'
      )
      select t.name as team, count(*)::int as played, sum(pts)::int as points,
        sum(gf - ga)::int as gd
      from team_matches tm
      join teams t on t.id = tm.team_id
      group by t.id, t.name
      order by points desc, gd desc
      limit 6
    `,
      // ความแม่นของผู้ทายแต่ละคน — ใจกลางของคำถามวิจัย เอาไปให้ AI เล่าเป็นสีสันในบทความได้
      // นับจาก prediction_scores ซึ่งมีเฉพาะแมตช์ที่จบแล้วเท่านั้น จึงไม่มีทางรั่วคำทายที่ยังไม่ล็อก
      sql<
        {
          name: string | null;
          is_ai: boolean;
          scored: number;
          correct: number;
        }[]
      >`
      select coalesce(u.display_name, u.name) as name, u.player_kind = 'ai' as is_ai,
        count(*)::int as scored,
        count(*) filter (where ps.points_awarded > 0)::int as correct
      from prediction_scores ps
      join predictions p on p.id = ps.prediction_id
      join users u on u.id = p.user_id
      group by u.id, u.name, u.display_name, u.player_kind
      order by correct desc
      limit 12
    `,
      // เก็บโลโก้ทีมไว้เพื่อมองย้อนกลับใน source snapshot เท่านั้น
      // แต่ภาพหน้าปกของบทความจะถูกแทนด้วยภาพฟุตบอลจริงทุกครั้ง เพื่อหลีกเลี่ยงการแสดงโลโก้ทีมบนข่าว
      sql<{ crest_url: string | null }[]>`
      with involved as (
        select m.home_team_id as team_id, m.kickoff_at,
          case when m.status = 'FINISHED' then 0 else 1 end as priority
        from matches m where m.season_id = ${seasonId}
        union all
        select m.away_team_id, m.kickoff_at,
          case when m.status = 'FINISHED' then 0 else 1 end
        from matches m where m.season_id = ${seasonId}
      )
      select distinct on (t.id) t.crest_url
      from involved i
      join teams t on t.id = i.team_id
      where t.crest_url is not null
      order by t.id, i.priority, i.kickoff_at desc
      limit 3
    `,
    ]);

  const externalNews = await fetchExternalNews(
    season?.name ?? "Premier League",
  );
  const newsImages = externalNews
    .map((item) => item.imageUrl)
    .filter((url): url is string => Boolean(url));

  return {
    date: today,
    seasonName: season?.name ?? "Premier League",
    currentMatchday,
    recentResults: recentResults.map((r) => ({
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      homeScore: r.home_score,
      awayScore: r.away_score,
      kickoffAt: r.kickoff_at,
    })),
    upcomingMatches: upcomingMatches.map((r) => ({
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      kickoffAt: r.kickoff_at,
    })),
    standings: standings.map((s, i) => ({
      rank: i + 1,
      team: s.team,
      played: s.played,
      points: s.points,
      goalDiff: s.gd,
    })),
    predictorAccuracy: accuracy.map((a) => ({
      name: a.name,
      isAi: a.is_ai,
      scored: a.scored,
      correct: a.correct,
    })),
    externalNews,
    coverImageUrls:
      newsImages.length > 0
        ? [...newsImages, ...DEFAULT_ARTICLE_COVER_IMAGES].slice(0, 6)
        : DEFAULT_ARTICLE_COVER_IMAGES,
  };
}

function formatSource(src: ArticleSource): string {
  const results =
    src.recentResults.length > 0
      ? src.recentResults
          .map(
            (r) => `${r.homeTeam} ${r.homeScore}-${r.awayScore} ${r.awayTeam}`,
          )
          .join("\n")
      : "ยังไม่มีนัดที่แข่งจบ";

  const upcoming =
    src.upcomingMatches.length > 0
      ? src.upcomingMatches
          .map((m) => `${m.homeTeam} พบ ${m.awayTeam}`)
          .join("\n")
      : "ยังไม่มีโปรแกรมนัดถัดไป";

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

  const externalNews =
    src.externalNews.length > 0
      ? src.externalNews
          .slice(0, 3)
          .map((n) => `${n.title}${n.source ? ` (${n.source})` : ""}`)
          .join("\n")
      : "ยังไม่มีข่าวฟุตบอลภายนอกในรอบวัน";

  const hasCurrentMatch =
    src.recentResults.length > 0 || src.upcomingMatches.length > 0;
  const storySeeds = (
    !hasCurrentMatch && src.externalNews.length > 0
      ? buildStorySeeds(src)
      : rotateSeedOrder(buildStorySeeds(src), src.date)
  ).slice(0, 4);
  const topicDirective =
    !hasCurrentMatch && src.externalNews.length > 0
      ? "หัวข้อบังคับวันนี้: ไม่มีแมตช์ของลีกในวันนี้หรือช่วงล่าสุด ให้เขียนจากข่าวภายนอกด้านล่างเป็นหัวข้อหลัก โดยเน้นการย้ายทีม อาการบาดเจ็บ หรือความพร้อมทีม ห้ามใช้ตารางคะแนน ผลการแข่งขันเก่า หรือความแม่นของผู้ทายเป็นหัวข้อหลัก"
      : "หัวข้อวันนี้: เลือกจากลำดับความสำคัญของข้อมูลการแข่งขันและข่าวที่ระบุไว้ด้านล่าง";
  const storyOptions = storySeeds
    .map(
      (seed, index) =>
        `มุมที่ ${index + 1}: ${seed.label}\n- ${seed.evidence.join("\n- ")}`,
    )
    .join("\n\n");

  return `${topicDirective}

วันที่: ${src.date}
ฤดูกาล: ${src.seasonName} (แมตช์เดย์ปัจจุบัน: ${src.currentMatchday ?? "ไม่ทราบ"})

ผลการแข่งขันล่าสุด:
${results}

โปรแกรมนัดถัดไป:
${upcoming}

ตารางคะแนน (6 อันดับแรก):
${table}

ความแม่นยำของผู้ทายในเว็บ Pundit:
${accuracy}

ข่าวฟุตบอลรอบวันที่เกี่ยวกับลีก:
${externalNews}

ไอเดียเรื่องที่สามารถเลือกเล่า:
${storyOptions}`;
}

export async function generateArticle(modelId: string, src: ArticleSource) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY ใน .env.local");
  }
  const google = createGoogleGenerativeAI({ apiKey });

  const { object } = await generateObject({
    model: google(modelId),
    schema: articleSchema,
    system: SYSTEM_PROMPT,
    prompt: formatSource(src),
    abortSignal: AbortSignal.timeout(90_000),
    maxRetries: 5,
  });

  return object;
}
