import { sqlClient } from "@/db/client";

// ── เจาะลึก AI: แม่นตรงไหน พลาดตรงไหน ─────────────────────────────────────────
//
// ต่อยอดจาก vs-ai.ts ซึ่งตอบแค่ "ใครแม่นกว่า" — ชุดนี้ตอบ "แม่นเพราะอะไร/ในเงื่อนไขไหน"
// ทุก query นับจาก prediction_scores (มีเฉพาะนัดที่จบ) จึงไม่มีทางรั่วคำทายล่วงหน้า และ
// นับข้ามทุกลีกเพราะความแม่นเป็นคุณสมบัติของผู้ทาย ไม่ใช่ของลีก (นับ distinct ต่อ prediction
// ผ่าน min เพื่อไม่ให้คนที่อยู่หลายลีกถูกนับคำทายเดิมซ้ำ)

export type AiConditionRow = {
  name: string | null;
  agentKey: string | null;
  isAi: boolean;
  total: number;
  correct: number;
  homeTotal: number;
  homeCorrect: number;
  awayTotal: number;
  awayCorrect: number;
  drawPredicted: number;
  drawCorrect: number;
  avgLatencyMs: number | null;
};

/** ความแม่นแยกตามชนิดผลที่ทาย ของผู้ทายทุกคน (คน+AI) เรียงตามความแม่นรวม */
export async function getConditionBreakdown(
  minPredictions = 5,
): Promise<AiConditionRow[]> {
  const rows = await sqlClient<
    {
      name: string | null;
      agent_key: string | null;
      is_ai: boolean;
      total: number;
      correct: number;
      home_total: number;
      home_correct: number;
      away_total: number;
      away_correct: number;
      draw_predicted: number;
      draw_correct: number;
      avg_latency_ms: number | null;
    }[]
  >`
    with scored as (
      select distinct on (p.id)
        p.id, p.user_id, p.predicted_outcome, ps.points_awarded > 0 as correct
      from prediction_scores ps
      join predictions p on p.id = ps.prediction_id
      order by p.id
    )
    select
      coalesce(u.display_name, u.name) as name,
      a.agent_key,
      u.player_kind = 'ai' as is_ai,
      count(*)::int as total,
      count(*) filter (where s.correct)::int as correct,
      count(*) filter (where s.predicted_outcome = 'HOME')::int as home_total,
      count(*) filter (where s.predicted_outcome = 'HOME' and s.correct)::int
        as home_correct,
      count(*) filter (where s.predicted_outcome = 'AWAY')::int as away_total,
      count(*) filter (where s.predicted_outcome = 'AWAY' and s.correct)::int
        as away_correct,
      count(*) filter (where s.predicted_outcome = 'DRAW')::int as draw_predicted,
      count(*) filter (where s.predicted_outcome = 'DRAW' and s.correct)::int
        as draw_correct,
      avg(l.latency_ms) filter (where l.latency_ms is not null) as avg_latency_ms
    from scored s
    join users u on u.id = s.user_id
    left join ai_agents a on a.user_id = u.id
    left join ai_prediction_logs l
      on l.ai_agent_id = a.id and l.prediction_id = s.id
    group by u.id, u.display_name, u.name, u.player_kind, a.agent_key
    having count(*) >= ${minPredictions}
    order by count(*) filter (where s.correct)::numeric / count(*) desc
  `;

  return rows.map((row) => ({
    name: row.name,
    agentKey: row.agent_key,
    isAi: row.is_ai,
    total: row.total,
    correct: row.correct,
    homeTotal: row.home_total,
    homeCorrect: row.home_correct,
    awayTotal: row.away_total,
    awayCorrect: row.away_correct,
    drawPredicted: row.draw_predicted,
    drawCorrect: row.draw_correct,
    avgLatencyMs:
      row.avg_latency_ms === null ? null : Math.round(Number(row.avg_latency_ms)),
  }));
}

export type UpsetMatch = {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  kickoffAt: string;
  matchday: number;
  competitionCode: string;
  predictors: number;
  correctCount: number;
};

/**
 * นัดหักปากกา — นัดที่ผู้ทาย (≥ minPredictors คน) พลาดกันแทบยกลีก
 * เรียงจากสัดส่วนคนถูกน้อยสุดขึ้นก่อน: 0% = ไม่มีใครเห็นผลนี้มาก่อนเลยทั้งคนทั้ง AI
 */
export async function getUpsetMatches(
  limit = 8,
  minPredictors = 4,
): Promise<UpsetMatch[]> {
  const rows = await sqlClient<
    {
      home_team: string;
      away_team: string;
      home_score: number;
      away_score: number;
      kickoff_at: string;
      matchday: number;
      competition_code: string;
      predictors: number;
      correct_count: number;
    }[]
  >`
    with per_match as (
      select p.match_id,
        count(distinct p.id)::int as predictors,
        count(distinct p.id) filter (
          where p.predicted_outcome::text = case
            when m.home_score > m.away_score then 'HOME'
            when m.home_score < m.away_score then 'AWAY'
            else 'DRAW'
          end
        )::int as correct_count
      from predictions p
      join matches m on m.id = p.match_id
      where m.status = 'FINISHED'
        and m.home_score is not null and m.away_score is not null
      group by p.match_id
      having count(distinct p.id) >= ${minPredictors}
    )
    select ht.name as home_team, at.name as away_team,
      m.home_score, m.away_score, m.kickoff_at::text as kickoff_at,
      m.matchday, s.competition_code,
      pm.predictors, pm.correct_count
    from per_match pm
    join matches m on m.id = pm.match_id
    join seasons s on s.id = m.season_id
    join teams ht on ht.id = m.home_team_id
    join teams at on at.id = m.away_team_id
    order by pm.correct_count::numeric / pm.predictors asc, m.kickoff_at desc
    limit ${limit}
  `;

  return rows.map((row) => ({
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeScore: row.home_score,
    awayScore: row.away_score,
    kickoffAt: row.kickoff_at,
    matchday: row.matchday,
    competitionCode: row.competition_code,
    predictors: row.predictors,
    correctCount: row.correct_count,
  }));
}
