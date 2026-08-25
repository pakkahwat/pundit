import { sql } from 'drizzle-orm';

import { db } from '@/db/client';

// ── ตัวเลขสำหรับหน้า "คนปะทะ AI" ───────────────────────────────────────────────
//
// ทุก query ในไฟล์นี้นับเฉพาะแมตช์ที่ FINISHED เท่านั้น ซึ่งแปลว่าคิกออฟผ่านไปแล้วเสมอ
// จึงอ่าน predictions ได้ตรง ๆ โดยไม่ต้องผ่าน withUserContext — RLS policy
// predictions_select_own_or_locked มีเงื่อนไข OR ฝั่ง "แมตช์ล็อกแล้ว" ที่เป็นจริงเองโดยไม่ต้อง
// มี user context (เหตุผลเดียวกับหน้า reveal และตาราง prediction_scores ที่ไม่มี RLS เลย)
//
// "ถูก" นิยามจากสกอร์จริงของแมตช์ ไม่ได้ดูจาก prediction_scores เพราะคะแนนผันตามกติกาของแต่ละ
// ลีก (scoring_config) — หน้านี้ถามเรื่องความแม่น ไม่ใช่เรื่องแต้ม จึงต้องนับจากผลดิบ

// นิพจน์ SQL ที่แปลงสกอร์เป็นผล HOME/DRAW/AWAY — ต้องตรงกับที่ใช้ใน jobs/score.ts เป๊ะ ๆ
const ACTUAL_OUTCOME = sql`
  case
    when m.home_score > m.away_score then 'HOME'
    when m.home_score < m.away_score then 'AWAY'
    else 'DRAW'
  end
`;

const FINISHED = sql`
  m.status = 'FINISHED' and m.home_score is not null and m.away_score is not null
`;

export type KindTotals = { total: number; correct: number };
export type VsAiSummary = { human: KindTotals; ai: KindTotals; matchesCovered: number };

export async function getVsAiSummary(): Promise<VsAiSummary> {
  const rows = await db.execute<{
    player_kind: 'human' | 'ai';
    total: number;
    correct: number;
  }>(sql`
    select
      u.player_kind,
      count(*)::int as total,
      count(*) filter (where p.predicted_outcome::text = ${ACTUAL_OUTCOME})::int as correct
    from predictions p
    join matches m on m.id = p.match_id
    join users u on u.id = p.user_id
    where ${FINISHED}
    group by u.player_kind
  `);

  const [{ matches_covered: matchesCovered }] = await db.execute<{ matches_covered: number }>(sql`
    select count(distinct m.id)::int as matches_covered
    from matches m
    join predictions p on p.match_id = m.id
    where ${FINISHED}
  `);

  const pick = (kind: 'human' | 'ai'): KindTotals => {
    const row = rows.find((r) => r.player_kind === kind);
    return { total: row?.total ?? 0, correct: row?.correct ?? 0 };
  };

  return { human: pick('human'), ai: pick('ai'), matchesCovered };
}

export type MatchdayPoint = {
  matchday: number;
  humanCorrect: number;
  humanTotal: number;
  aiCorrect: number;
  aiTotal: number;
};

// ความแม่นรายแมตช์เดย์ — รวมทุกลีกฟุตบอลที่ active เข้าด้วยกันตามเลขแมตช์เดย์
// (PL แมตช์เดย์ 3 กับลาลีกาแมตช์เดย์ 3 ไม่ใช่วันเดียวกันเป๊ะ แต่ใกล้เคียงพอที่จะเทียบเป็นแกนเวลาได้
//  และการรวมกันทำให้ตัวอย่างต่อจุดเยอะขึ้น เส้นกราฟจึงไม่กระโดดจนอ่านไม่ได้)
export async function getAccuracyByMatchday(): Promise<MatchdayPoint[]> {
  return db.execute<MatchdayPoint>(sql`
    select
      m.matchday,
      count(*) filter (where u.player_kind = 'human' and p.predicted_outcome::text = ${ACTUAL_OUTCOME})::int as "humanCorrect",
      count(*) filter (where u.player_kind = 'human')::int as "humanTotal",
      count(*) filter (where u.player_kind = 'ai' and p.predicted_outcome::text = ${ACTUAL_OUTCOME})::int as "aiCorrect",
      count(*) filter (where u.player_kind = 'ai')::int as "aiTotal"
    from predictions p
    join matches m on m.id = p.match_id
    join users u on u.id = p.user_id
    where ${FINISHED}
    group by m.matchday
    order by m.matchday asc
  `);
}

export type PlayerAccuracy = {
  userId: string;
  name: string | null;
  playerKind: 'human' | 'ai';
  total: number;
  correct: number;
};

export async function getPlayerAccuracy(minPredictions = 1): Promise<PlayerAccuracy[]> {
  return db.execute<PlayerAccuracy>(sql`
    select
      u.id as "userId",
      coalesce(u.display_name, u.name) as name,
      u.player_kind as "playerKind",
      count(*)::int as total,
      count(*) filter (where p.predicted_outcome::text = ${ACTUAL_OUTCOME})::int as correct
    from predictions p
    join matches m on m.id = p.match_id
    join users u on u.id = p.user_id
    where ${FINISHED}
    group by u.id, u.display_name, u.name, u.player_kind
    having count(*) >= ${minPredictions}
    order by (count(*) filter (where p.predicted_outcome::text = ${ACTUAL_OUTCOME}))::float / count(*) desc,
             count(*) desc
  `);
}

export type SplitMatch = {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  homeScore: number;
  awayScore: number;
  kickoffAt: string;
  humanCorrect: number;
  humanTotal: number;
  aiCorrect: number;
  aiTotal: number;
};

// นัดที่คนกับ AI เห็นต่างกันมากที่สุด — เรียงตามส่วนต่างของอัตราถูก (AI ลบ คน)
// เอาทั้งหัวและท้ายของรายการมาแสดง จะได้เห็นทั้ง "นัดที่ AI เอาชนะคน" และ "นัดที่คนเอาชนะ AI"
export async function getBiggestSplits(limit = 3): Promise<{
  aiWon: SplitMatch[];
  humansWon: SplitMatch[];
}> {
  const rows = await db.execute<SplitMatch & { edge: number }>(sql`
    select
      m.id as "matchId",
      ht.name as "homeTeam",
      at.name as "awayTeam",
      ht.crest_url as "homeCrest",
      at.crest_url as "awayCrest",
      m.home_score as "homeScore",
      m.away_score as "awayScore",
      m.kickoff_at as "kickoffAt",
      count(*) filter (where u.player_kind = 'human' and p.predicted_outcome::text = ${ACTUAL_OUTCOME})::int as "humanCorrect",
      count(*) filter (where u.player_kind = 'human')::int as "humanTotal",
      count(*) filter (where u.player_kind = 'ai' and p.predicted_outcome::text = ${ACTUAL_OUTCOME})::int as "aiCorrect",
      count(*) filter (where u.player_kind = 'ai')::int as "aiTotal",
      (
        coalesce((count(*) filter (where u.player_kind = 'ai' and p.predicted_outcome::text = ${ACTUAL_OUTCOME}))::float
          / nullif(count(*) filter (where u.player_kind = 'ai'), 0), 0)
        - coalesce((count(*) filter (where u.player_kind = 'human' and p.predicted_outcome::text = ${ACTUAL_OUTCOME}))::float
          / nullif(count(*) filter (where u.player_kind = 'human'), 0), 0)
      ) as edge
    from predictions p
    join matches m on m.id = p.match_id
    join users u on u.id = p.user_id
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    where ${FINISHED}
    group by m.id, ht.name, at.name, ht.crest_url, at.crest_url, m.home_score, m.away_score, m.kickoff_at
    -- เอาเฉพาะนัดที่มีทั้งคนและ AI ทาย ไม่งั้นส่วนต่างไม่มีความหมาย
    having count(*) filter (where u.player_kind = 'human') > 0
       and count(*) filter (where u.player_kind = 'ai') > 0
    order by edge desc
  `);

  const meaningful = rows.filter((r) => r.edge !== 0);
  return {
    aiWon: meaningful.filter((r) => r.edge > 0).slice(0, limit),
    // ท้ายรายการคือฝั่งที่คนชนะมากสุด กลับลำดับให้ส่วนต่างมากสุดอยู่บน
    humansWon: meaningful
      .filter((r) => r.edge < 0)
      .slice(-limit)
      .reverse(),
  };
}

export function accuracyPct(t: KindTotals | { total: number; correct: number }): number | null {
  return t.total === 0 ? null : (t.correct / t.total) * 100;
}

export type CumulativePoint = {
  matchday: number;
  human: number | null;
  ai: number | null;
  humanTotal: number;
  aiTotal: number;
};

// แปลงค่ารายแมตช์เดย์เป็น "ความแม่นสะสม"
//
// ต้องสะสม ไม่ใช่พล็อตความแม่นเฉพาะแมตช์เดย์นั้น ๆ เพราะแต่ละแมตช์เดย์มีแค่ไม่กี่นัด
// เส้นกราฟจะกระโดด 0-100% ตลอดจนอ่านแนวโน้มไม่ได้เลย
//
// อยู่ในไฟล์นี้ (ไม่ใช่ในไฟล์ page) เพราะเป็นการคำนวณล้วน ๆ ไม่เกี่ยวกับการแสดงผล —
// และ eslint ห้ามสะสมค่าลงตัวแปรนอก callback ระหว่าง render ของ component ด้วย
export function toCumulativePoints(rows: MatchdayPoint[]): CumulativePoint[] {
  const acc = { hc: 0, ht: 0, ac: 0, at: 0 };
  const out: CumulativePoint[] = [];

  for (const row of rows) {
    acc.hc += row.humanCorrect;
    acc.ht += row.humanTotal;
    acc.ac += row.aiCorrect;
    acc.at += row.aiTotal;
    out.push({
      matchday: row.matchday,
      human: acc.ht === 0 ? null : (acc.hc / acc.ht) * 100,
      ai: acc.at === 0 ? null : (acc.ac / acc.at) * 100,
      humanTotal: row.humanTotal,
      aiTotal: row.aiTotal,
    });
  }

  return out;
}
