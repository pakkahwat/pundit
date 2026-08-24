import type postgres from 'postgres';

import type { FdMatch } from './football-data';

// upsert แมตช์เดียว พร้อม bump result_version เฉพาะตอนสกอร์/status เปลี่ยนจริง — นี่คือกลไก
// idempotent หลักของทั้งโปรเจกต์ (requirement ข้อ 2 และ 3 ใน "ห้ามพลาด") ดึงออกมาเป็น helper
// กลางให้ sync-fixtures.ts (sync เต็มตอนตั้งซีซัน) กับ sync-results.ts (cron รอบผลระหว่างสัปดาห์)
// เรียกใช้ตัวเดียวกัน — ถ้าต้องแก้ logic นี้จะได้แก้ที่เดียว ไม่มีทางเพี้ยนไปคนละทาง
export async function upsertMatch(
  sql: postgres.Sql,
  seasonId: string,
  homeTeamId: string,
  awayTeamId: string,
  m: FdMatch,
) {
  await sql`
    insert into matches (
      external_id, season_id, matchday, home_team_id, away_team_id,
      kickoff_at, status, home_score, away_score, result_version, last_synced_at
    )
    values (
      ${m.id}, ${seasonId}, ${m.matchday}, ${homeTeamId}, ${awayTeamId},
      ${m.utcDate}, ${m.status}, ${m.score.fullTime.home}, ${m.score.fullTime.away}, 0, now()
    )
    on conflict (external_id) do update set
      season_id = excluded.season_id,
      matchday = excluded.matchday,
      home_team_id = excluded.home_team_id,
      away_team_id = excluded.away_team_id,
      kickoff_at = excluded.kickoff_at,
      status = excluded.status,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      result_version = case
        when matches.status is distinct from excluded.status
          or matches.home_score is distinct from excluded.home_score
          or matches.away_score is distinct from excluded.away_score
        then matches.result_version + 1
        else matches.result_version
      end,
      last_synced_at = now()
  `;
}
