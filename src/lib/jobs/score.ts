import type postgres from 'postgres';

// คิดคะแนนแบบ idempotent ต่อลีก จากแมตช์ที่ FINISHED แล้ว
//
// กติกา: ทายผลแพ้/ชนะ/เสมอถูก = correct แต้ม (default 3) ผิด = wrong แต้ม (default 0)
//
// กลไก idempotent (requirement ข้อ 2): unique (league_id, prediction_id) + ON CONFLICT DO UPDATE
// ที่มี WHERE scored_result_version IS DISTINCT FROM excluded.scored_result_version ท้ายสุด —
// รันซ้ำกี่ครั้งก็ได้ผลเหมือนเดิม เพราะถ้า result_version ของแมตช์ไม่เปลี่ยน แถวเดิมจะไม่ถูกแตะเลย
// (ไม่ใช่แค่ "ค่าเท่าเดิม" แต่ "ไม่มี UPDATE เกิดขึ้นจริง" — scored_at ก็จะไม่ขยับ)
//
// รองรับผลแก้ย้อนหลัง (requirement ข้อ 3): ถ้า sync เจอสกอร์เปลี่ยน result_version จะขยับ
// ทำให้ WHERE ข้างบนเป็นจริงอีกครั้ง คะแนนถูกคำนวณใหม่อัตโนมัติโดยไม่ต้อง special-case อะไรเพิ่ม
export async function runScorePredictions(sql: postgres.Sql) {
  const rows = await sql`
    insert into prediction_scores (league_id, prediction_id, points_awarded, scored_result_version)
    select
      lm.league_id,
      p.id,
      case
        when p.predicted_outcome::text = case
               when m.home_score > m.away_score then 'HOME'
               when m.home_score < m.away_score then 'AWAY'
               else 'DRAW'
             end
          then (l.scoring_config->>'correct')::smallint
        else (l.scoring_config->>'wrong')::smallint
      end,
      m.result_version
    from matches m
    join predictions p on p.match_id = m.id
    join league_members lm on lm.user_id = p.user_id
    join leagues l on l.id = lm.league_id and l.season_id = m.season_id
    -- ต้องเช็คสกอร์ไม่เป็น null ด้วย ไม่ใช่เช็คแค่ status = 'FINISHED'
    --
    -- เหตุผล: ใน CASE ข้างบน ถ้า home_score/away_score เป็น null ทั้งคู่ การเทียบ > และ <
    -- จะได้ null (ไม่ใช่ true) ทั้งสองอัน แล้วตกไปเข้า ELSE ซึ่งคืนค่า 'DRAW' — แปลว่าแมตช์ที่
    -- ยังไม่มีสกอร์จะถูกนับเป็น "เสมอ" แล้วแจกแต้มให้ทุกคนที่ทายเสมอโดยที่ผลยังไม่ออก
    -- (เกิดได้จริงเมื่อ sync ได้ status มาก่อนสกอร์ ซึ่ง football-data.org ทำแบบนั้นเป็นบางครั้ง)
    where m.status = 'FINISHED'
      and m.home_score is not null
      and m.away_score is not null
    on conflict (league_id, prediction_id) do update set
      points_awarded = excluded.points_awarded,
      scored_result_version = excluded.scored_result_version,
      scored_at = now()
    where prediction_scores.scored_result_version is distinct from excluded.scored_result_version
    returning prediction_scores.id
  `;

  // จำนวนนี้คือ "แถวที่เพิ่งสร้างใหม่หรือคะแนนเปลี่ยนจริง" เท่านั้น ไม่ใช่จำนวนคำทายทั้งหมด
  return { processed: rows.length };
}
