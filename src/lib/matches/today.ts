import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { withUserContext } from '@/db/rls';
import { predictions } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

// ── "บอลวันนี้" สำหรับหน้าแรก ─────────────────────────────────────────────────
//
// เรื่องสำคัญที่ต้องรู้ก่อนอ่านไฟล์นี้: แผนฟรีของ football-data.org ไม่ส่งสกอร์สดมาให้
// (หน้า pricing ระบุตรง ๆ ว่า "Scores delayed" — ต้องขึ้นแผน €12/เดือนถึงจะได้ live)
// สกอร์ในตาราง matches จึงเก่าได้ถึงประมาณ 30 นาทีตามรอบ cron sync-results
//
// แต่ "นัดนี้กำลังแข่งอยู่หรือยัง" ไม่จำเป็นต้องถาม API เลย — เรารู้เวลาคิกออฟเป๊ะ ๆ อยู่แล้ว
// ใน kickoff_at ตั้งแต่ตอน sync โปรแกรมแข่ง คำนวณเอาเองจึงตรงตามนาทีจริง ไม่มี delay
// และแม่นกว่าการเชื่อ field status ที่ตัวมันเองก็ถูกหน่วงมาเหมือนกัน
//
// ช่วงเวลาที่ดึง: ย้อนหลัง 3 ชม. ถึงล่วงหน้า 24 ชม. — ครอบคลุมทั้งนัดที่กำลังเตะอยู่,
// นัดที่เพิ่งจบ และนัดที่กำลังจะเตะคืนนี้ ใช้ช่วงเลื่อนแทนการตัดตามวันปฏิทิน เพราะบอลยุโรป
// เตะดึกมากในเวลาไทย (สี่ทุ่มถึงตีสอง) ถ้าตัดตามวันจะขาดกลางแมตช์เดย์พอดี

export type TodayMatch = {
  id: string;
  kickoffAt: string;
  status: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  homeScore: number | null;
  awayScore: number | null;
  competitionCode: string;
  matchday: number;
  /** วินาทีที่ผ่านไปตั้งแต่คิกออฟ (ติดลบ = ยังไม่เตะ) คำนวณจาก now() ของ Postgres */
  secondsSinceKickoff: number;
  /** ผู้ใช้คนนี้ทายนัดนี้แล้วหรือยัง — null ถ้านัดนี้ไม่ได้อยู่ในลีกที่เขาเล่น */
  predicted: boolean | null;
};

export async function getTodayMatches(userId: string): Promise<TodayMatch[]> {
  const rows = await db.execute<Omit<TodayMatch, 'predicted'> & { inMyLeague: boolean }>(sql`
    select
      m.id,
      m.kickoff_at as "kickoffAt",
      m.status::text as status,
      ht.name as "homeTeam",
      at.name as "awayTeam",
      ht.crest_url as "homeCrest",
      at.crest_url as "awayCrest",
      m.home_score as "homeScore",
      m.away_score as "awayScore",
      s.competition_code as "competitionCode",
      m.matchday,
      extract(epoch from (now() - m.kickoff_at))::int as "secondsSinceKickoff",
      exists (
        select 1
        from league_members lm
        join leagues l on l.id = lm.league_id
        where lm.user_id = ${userId}::uuid and l.season_id = m.season_id
      ) as "inMyLeague"
    from matches m
    join seasons s on s.id = m.season_id and s.is_active = true
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    where m.kickoff_at between now() - interval '3 hours' and now() + interval '24 hours'
    order by m.kickoff_at asc
  `);

  if (rows.length === 0) return [];

  // ต้องผ่าน withUserContext เพราะ RLS บน predictions — ไม่งั้นอ่านคำทายของตัวเองไม่เห็น
  const ids = rows.map((r) => r.id);
  const mine = await withUserContext(userId, (tx) =>
    tx
      .select({ matchId: predictions.matchId })
      .from(predictions)
      .where(and(eq(predictions.userId, userId), inArray(predictions.matchId, ids))),
  );
  const predictedIds = new Set(mine.map((p) => p.matchId));

  return rows.map(({ inMyLeague, ...r }) => ({
    ...r,
    predicted: inMyLeague ? predictedIds.has(r.id) : null,
  }));
}
