import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject } from 'ai';
import type postgres from 'postgres';
import { z } from 'zod';

// บทความรายวันที่ AI เขียน — หลักการสำคัญ: ให้โมเดลเขียนจาก "ข้อมูลที่เราส่งให้เท่านั้น" ซึ่งดึงมา
// จาก DB ของเราเองล้วน ๆ ไม่ใช่ให้มันนึกข่าวจากความจำ เพราะความจำของโมเดลมีวันหมดอายุและแต่งเรื่อง
// ขึ้นมาเองได้ ส่วนตัวเลขใน DB เราตรวจย้อนกลับได้ทุกตัว

const articleSchema = z.object({
  title: z.string().describe('พาดหัวภาษาไทย สั้น กระชับ ไม่เกิน 60 ตัวอักษร'),
  body: z
    .string()
    .describe(
      'เนื้อหาภาษาไทยแบบ markdown ความยาว 3-5 ย่อหน้า เขียนเป็นความเรียง ห้ามใช้ bullet point',
    ),
});

const SYSTEM_PROMPT = `คุณเป็นนักเขียนคอลัมน์ฟุตบอลของเว็บ "Pundit" ซึ่งเป็นลีกทายผลพรีเมียร์ลีก
ที่มีทั้งคนจริงและ AI แข่งทายผลกัน หน้าที่ของคุณคือเขียนบทความสรุปประจำวันจากข้อมูลที่ได้รับ

กฎเหล็ก: เขียนได้เฉพาะสิ่งที่อยู่ในข้อมูลที่ให้มาเท่านั้น ห้ามเพิ่มข้อเท็จจริงใด ๆ จากความรู้ของคุณเอง
ไม่ว่าจะเป็นชื่อนักเตะ อาการบาดเจ็บ ข่าวย้ายทีม คำพูดของโค้ช หรือสถิติที่ไม่ได้ระบุไว้ เพราะข้อมูล
เหล่านั้นอาจไม่ตรงกับความจริง ณ ปัจจุบัน ถ้าข้อมูลมีน้อยก็เขียนสั้นได้ ไม่ต้องแต่งเติมให้ยาว

น้ำเสียง: เป็นกันเอง สนุก มีอารมณ์ขันบ้าง แบบคอลัมนิสต์ฟุตบอลคุยกับเพื่อน ไม่ใช่รายงานข่าวแห้ง ๆ
ถ้ามีประเด็นที่ AI ทายพลาดหรือทายแม่นกว่าคน ให้หยิบมาเล่นเป็นสีสันได้ เพราะนั่นคือจุดขายของเว็บนี้`;

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
  standings: { rank: number; team: string; played: number; points: number; goalDiff: number }[];
  predictorAccuracy: {
    name: string | null;
    isAi: boolean;
    scored: number;
    correct: number;
  }[];
  // โลโก้ทีมสำหรับทำภาพหน้าปก — ไม่ได้ส่งให้โมเดล ใช้ตอนแสดงผลอย่างเดียว
  coverImageUrls: string[];
};

// รวบรวมข้อมูลดิบสำหรับเขียนบทความ — ทุก query อิงจากข้อมูลที่เกิดขึ้นจริงใน DB แล้วเท่านั้น
export async function buildArticleSource(
  sql: postgres.Sql,
  seasonId: string,
  today: string,
): Promise<ArticleSource> {
  const [season] = await sql<{ name: string; current_matchday: number | null }[]>`
    select name, current_matchday from seasons where id = ${seasonId}
  `;

  const [recentResults, upcomingMatches, standings, accuracy, crests] = await Promise.all([
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
      where m.season_id = ${seasonId} and m.status = 'FINISHED'
      order by m.kickoff_at desc
      limit 10
    `,
    sql<{ home_team: string; away_team: string; kickoff_at: string }[]>`
      select ht.name as home_team, at.name as away_team, m.kickoff_at
      from matches m
      join teams ht on ht.id = m.home_team_id
      join teams at on at.id = m.away_team_id
      where m.season_id = ${seasonId} and m.kickoff_at > now()
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
    sql<{ name: string | null; is_ai: boolean; scored: number; correct: number }[]>`
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
    // โลโก้ทีมของนัดล่าสุดที่จบไปแล้ว ใช้ทำภาพหน้าปกการ์ดบทความ — ถ้ายังไม่มีนัดไหนจบเลย
    // (ต้นซีซัน) ค่อย fallback ไปเอาทีมจากโปรแกรมนัดถัดไปแทน
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

  return {
    date: today,
    seasonName: season?.name ?? 'Premier League',
    currentMatchday: season?.current_matchday ?? null,
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
    coverImageUrls: crests.map((c) => c.crest_url).filter((u): u is string => Boolean(u)),
  };
}

function formatSource(src: ArticleSource): string {
  const results =
    src.recentResults.length > 0
      ? src.recentResults
          .map((r) => `${r.homeTeam} ${r.homeScore}-${r.awayScore} ${r.awayTeam}`)
          .join('\n')
      : 'ยังไม่มีนัดที่แข่งจบ';

  const upcoming =
    src.upcomingMatches.length > 0
      ? src.upcomingMatches.map((m) => `${m.homeTeam} พบ ${m.awayTeam}`).join('\n')
      : 'ยังไม่มีโปรแกรมนัดถัดไป';

  const table =
    src.standings.length > 0
      ? src.standings
          .map((s) => `${s.rank}. ${s.team} — ${s.points} แต้ม จาก ${s.played} นัด (ผลต่าง ${s.goalDiff})`)
          .join('\n')
      : 'ยังไม่มีตารางคะแนน';

  const accuracy =
    src.predictorAccuracy.length > 0
      ? src.predictorAccuracy
          .map(
            (a) =>
              `${a.name}${a.isAi ? ' (AI)' : ''} — ทายถูก ${a.correct} จาก ${a.scored} นัด`,
          )
          .join('\n')
      : 'ยังไม่มีใครถูกคิดคะแนน';

  return `วันที่: ${src.date}
ฤดูกาล: ${src.seasonName} (แมตช์เดย์ปัจจุบัน: ${src.currentMatchday ?? 'ไม่ทราบ'})

ผลการแข่งขันล่าสุด:
${results}

โปรแกรมนัดถัดไป:
${upcoming}

ตารางคะแนน (6 อันดับแรก):
${table}

ความแม่นยำของผู้ทายในเว็บ Pundit:
${accuracy}`;
}

export async function generateArticle(modelId: string, src: ArticleSource) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GOOGLE_GENERATIVE_AI_API_KEY ใน .env.local');
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
