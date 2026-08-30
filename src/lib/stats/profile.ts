import type postgres from "postgres";

import {
  BADGES,
  computeStreaks,
  evaluateBadges,
  isBadgeKey,
  type BadgeKey,
  type ScoredRow,
} from "./badges";

// ── โปรไฟล์ผู้ทาย: รวบรวมประวัติ ประเมินเหรียญ และบันทึกสถิติถาวร ─────────────────
//
// ถูกเรียกจากสองทาง ผลเหมือนกันทั้งคู่ (idempotent):
// 1. ตอนมีคนเปิด profile card (api/profile) — คนที่ถูกดูจะได้เหรียญ/สถิติอัปเดตสดเสมอ
// 2. ท้ายงาน score cron สำหรับทุกคนที่เพิ่งถูกคิดคะแนน — เหรียญมาถึงแม้ไม่มีใครเปิดดู
//
// ทุก query อ่านเฉพาะนัดที่จบแล้ว ซึ่ง RLS เปิดให้อ่านหลังคิกออฟอยู่แล้ว (locked)
// จึงไม่ต้องตั้ง user context เลย — และไม่มีทางรั่วคำทายof นัดที่ยังไม่เตะโดยโครงสร้าง

const MIN_SAMPLE = 10;
const MAJORITY_MIN_VOTERS = 3;

export type ProfileBadge = {
  key: BadgeKey;
  label: string;
  description: string;
  emoji: string;
  earnedAt: string;
};

export type LeagueProfile = {
  /** สถิติรวมทุกลีก (คำทายเป็นของกลาง คิดจากประวัติทั้งหมดของคนนั้น) */
  overall: {
    predicted: number;
    finished: number;
    correct: number;
    accuracy: number | null;
    bestStreak: number;
    /** ผล 5 นัดจบล่าสุด เรียงเก่า→ใหม่ (true = ถูก) */
    recentForm: boolean[];
  };
  /** สถิติเฉพาะลีกที่กดดูจาก — การ์ดโปรไฟล์ในลีกโชว์ก้อนนี้เป็นหลัก (ภาพรวมไปอยู่ /settings) */
  league: {
    scored: number;
    correct: number;
    points: number;
    accuracy: number | null;
    /** ผล 5 นัดจบล่าสุด "เฉพาะฤดูกาลของลีกนี้" เรียงเก่า→ใหม่ */
    recentForm: boolean[];
  };
  badges: ProfileBadge[];
};

async function fetchScoredRows(
  sql: postgres.Sql,
  userId: string,
): Promise<(ScoredRow & { predictedAt: string; seasonId: string })[]> {
  // majority ใช้ mode() ของคำทายทั้งหมดในนัดนั้น (อ่านได้เพราะนัดจบ = locked แล้ว)
  const rows = await sql<
    {
      matchday: number;
      correct: boolean;
      predicted: "HOME" | "DRAW" | "AWAY";
      lead_hours: number | null;
      submitted_hour_bkk: number | null;
      against_majority: boolean;
      kickoff_at: string;
      season_id: string;
    }[]
  >`
    with mine as (
      select p.id, p.match_id, p.predicted_outcome, p.submitted_at,
        m.kickoff_at, m.matchday, m.season_id,
        case
          when m.home_score > m.away_score then 'HOME'
          when m.home_score < m.away_score then 'AWAY'
          else 'DRAW'
        end as actual
      from predictions p
      join matches m on m.id = p.match_id
      where p.user_id = ${userId}::uuid
        and m.status = 'FINISHED'
        and m.home_score is not null
        and m.away_score is not null
    ),
    majority as (
      select p.match_id,
        mode() within group (order by p.predicted_outcome) as majority_outcome,
        count(*)::int as voters
      from predictions p
      where p.match_id in (select match_id from mine)
      group by p.match_id
    )
    select
      mine.matchday,
      mine.predicted_outcome::text = mine.actual as correct,
      mine.predicted_outcome::text as predicted,
      extract(epoch from (mine.kickoff_at - mine.submitted_at)) / 3600
        as lead_hours,
      extract(hour from (mine.submitted_at at time zone 'Asia/Bangkok'))::int
        as submitted_hour_bkk,
      coalesce(
        maj.voters >= ${MAJORITY_MIN_VOTERS}
          and mine.predicted_outcome is distinct from maj.majority_outcome,
        false
      ) as against_majority,
      mine.kickoff_at::text as kickoff_at,
      mine.season_id
    from mine
    left join majority maj on maj.match_id = mine.match_id
    order by mine.kickoff_at asc
  `;

  return rows.map((row) => ({
    matchday: row.matchday,
    correct: row.correct,
    predicted: row.predicted,
    leadTimeHours: row.lead_hours === null ? null : Number(row.lead_hours),
    submittedHourBkk:
      row.submitted_hour_bkk === null ? null : Number(row.submitted_hour_bkk),
    againstMajority: row.against_majority,
    predictedAt: row.kickoff_at,
    seasonId: row.season_id,
  }));
}

/** ความแม่นเทียบ AI ที่เก่งที่สุด (นับทั้งระบบ ฝั่งไหนตัวอย่างน้อยกว่า 10 นัดไม่ตัดสิน) */
async function beatsBestAi(
  sql: postgres.Sql,
  userId: string,
  myFinished: number,
  myCorrect: number,
): Promise<boolean> {
  if (myFinished < MIN_SAMPLE) return false;
  const [bestAi] = await sql<{ scored: number; correct: number }[]>`
    select count(*)::int as scored,
      count(*) filter (where ps.points_awarded > 0)::int as correct
    from prediction_scores ps
    join predictions p on p.id = ps.prediction_id
    join users u on u.id = p.user_id
    where u.player_kind = 'ai'
    group by u.id
    order by count(*) filter (where ps.points_awarded > 0)::numeric
      / greatest(count(*), 1) desc
    limit 1
  `;
  if (!bestAi || bestAi.scored < MIN_SAMPLE) return false;
  return myCorrect / myFinished > bestAi.correct / bestAi.scored;
}

/**
 * รวบรวมโปรไฟล์ + บันทึกผลข้างเคียงสองอย่างลง DB:
 * เหรียญใหม่ (insert แบบไม่ทับของเดิม — earned_at แรกคือวันได้จริง) และสตรีคสูงสุด
 * (เขียนทับเฉพาะตอนทำลายสถิติ ด้วย greatest จึงไม่มีทางลดลง)
 */
export async function getLeagueProfile(
  sql: postgres.Sql,
  leagueId: string,
  userId: string,
): Promise<LeagueProfile> {
  const scoredRows = await fetchScoredRows(sql, userId);
  const [leagueRow] = await sql<{ season_id: string }[]>`
    select season_id from leagues where id = ${leagueId}::uuid
  `;
  // ฟอร์มรายลีก = กรองจากแถวรวมที่ดึงมาแล้ว ไม่ยิง query เพิ่ม — เหรียญ/สตรีคยังคิดจากทุกลีก
  // ตามหลักที่ตกลงไว้ว่าเป็นสมบัติของ "โปรไฟล์" ส่วนความแม่น/ฟอร์มเป็นเรื่องของสนามที่กำลังดู
  const leagueRows = scoredRows.filter(
    (row) => row.seasonId === leagueRow?.season_id,
  );
  const finished = scoredRows.length;
  const correct = scoredRows.filter((row) => row.correct).length;
  const streaks = computeStreaks(scoredRows);

  const earnedNow = evaluateBadges(scoredRows, {
    beatsBestAi: await beatsBestAi(sql, userId, finished, correct),
  });

  const [[{ predicted }], [leagueStats], [me]] = await Promise.all([
    sql<{ predicted: number }[]>`
      select count(*)::int as predicted from predictions
      where user_id = ${userId}::uuid
    `,
    sql<{ scored: number; correct: number; points: number }[]>`
      select count(*)::int as scored,
        count(*) filter (where ps.points_awarded > 0)::int as correct,
        coalesce(sum(ps.points_awarded), 0)::int as points
      from prediction_scores ps
      join predictions p on p.id = ps.prediction_id
      where ps.league_id = ${leagueId}::uuid and p.user_id = ${userId}::uuid
    `,
    sql<{ best_streak: number }[]>`
      select best_streak from users where id = ${userId}::uuid
    `,
  ]);

  // บันทึกฝั่งถาวร — ทำหลังอ่านค่าเดิม จะได้รู้ว่าสถิติเดิมคือเท่าไร
  if (earnedNow.length > 0) {
    await sql`
      insert into user_badges (user_id, badge_key)
      select ${userId}::uuid, unnest(${earnedNow}::text[])
      on conflict (user_id, badge_key) do nothing
    `;
  }
  const bestStreak = Math.max(streaks.best, me?.best_streak ?? 0);
  if (bestStreak > (me?.best_streak ?? 0)) {
    await sql`
      update users set best_streak = greatest(best_streak, ${bestStreak})
      where id = ${userId}::uuid
    `;
  }

  const badgeRows = await sql<{ badge_key: string; earned_at: string }[]>`
    select badge_key, earned_at::text as earned_at from user_badges
    where user_id = ${userId}::uuid
    order by earned_at asc
  `;

  return {
    overall: {
      predicted,
      finished,
      correct,
      accuracy: finished > 0 ? correct / finished : null,
      bestStreak,
      recentForm: scoredRows.slice(-5).map((row) => row.correct),
    },
    league: {
      scored: leagueStats?.scored ?? 0,
      correct: leagueStats?.correct ?? 0,
      points: leagueStats?.points ?? 0,
      accuracy:
        (leagueStats?.scored ?? 0) > 0
          ? (leagueStats!.correct ?? 0) / leagueStats!.scored
          : null,
      recentForm: leagueRows.slice(-5).map((row) => row.correct),
    },
    badges: badgeRows
      .filter((row) => isBadgeKey(row.badge_key))
      .map((row) => {
        const key = row.badge_key as BadgeKey;
        return { key, ...BADGES[key], earnedAt: row.earned_at };
      }),
  };
}

/** เรียกท้าย score cron — ให้เหรียญกับทุกคนที่เพิ่งถูกคิดคะแนนโดยไม่ต้องรอใครเปิดดู */
export async function awardBadgesForUsers(
  sql: postgres.Sql,
  userIds: string[],
): Promise<void> {
  for (const userId of [...new Set(userIds)]) {
    const rows = await fetchScoredRows(sql, userId);
    const finished = rows.length;
    const correct = rows.filter((row) => row.correct).length;
    const earned = evaluateBadges(rows, {
      beatsBestAi: await beatsBestAi(sql, userId, finished, correct),
    });
    if (earned.length > 0) {
      await sql`
        insert into user_badges (user_id, badge_key)
        select ${userId}::uuid, unnest(${earned}::text[])
        on conflict (user_id, badge_key) do nothing
      `;
    }
    const { best } = computeStreaks(rows);
    await sql`
      update users set best_streak = greatest(best_streak, ${best})
      where id = ${userId}::uuid
    `;
  }
}
