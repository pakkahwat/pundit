import type postgres from 'postgres';

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';

export type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  matchday: number;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  score: { fullTime: { home: number | null; away: number | null } };
};

// token อ่านจาก process.env เท่านั้น ห้าม hardcode
export async function fdFetch<T>(pathname: string): Promise<T> {
  const token = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) {
    throw new Error('Missing FOOTBALL_DATA_API_TOKEN');
  }
  const res = await fetch(`${FOOTBALL_DATA_BASE}${pathname}`, {
    headers: { 'X-Auth-Token': token },
    // ไม่ให้ Next cache ผลลัพธ์ — งานนี้ต้องการข้อมูลสดเสมอ ไม่งั้นผลแข่งจะค้างอยู่ค่าเดิม
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`football-data.org ${pathname} ล้มเหลว: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// upsert แมตช์เดียว พร้อม bump result_version เฉพาะตอนสกอร์/status เปลี่ยนจริง — นี่คือกลไก
// idempotent หลักของทั้งโปรเจกต์ (requirement ข้อ 2 และ 3) รันซ้ำกี่ครั้งก็ไม่ทำให้คะแนนเพี้ยน
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

// sync ผลแข่งของทุกลีกที่ active อยู่ — 2 requests ต่อลีก (matches + competition)
// วนตาม seasons ที่มีใน DB ไม่ได้ hardcode รหัสลีกไว้ เพิ่มลีกใหม่ด้วย db:sync-fixtures แล้ว
// งานนี้จะตามไปดูแลให้เองอัตโนมัติ
export async function runSyncResults(sql: postgres.Sql, log = console.log) {
  const seasons = await sql<{ id: string; competition_code: string }[]>`
    select id, competition_code from seasons where is_active = true order by competition_code
  `;
  if (seasons.length === 0) {
    throw new Error('ไม่พบ active season — รัน db:sync-fixtures ก่อนอย่างน้อยหนึ่งครั้ง');
  }

  const teamRows = await sql<{ id: string; external_id: number }[]>`
    select id, external_id from teams
  `;
  const teamIdByExternalId = new Map(teamRows.map((t) => [t.external_id, t.id]));

  let processed = 0;
  let skipped = 0;
  const matchdays: Record<string, number | null> = {};

  for (const season of seasons) {
    const code = season.competition_code;
    const matchesRes = await fdFetch<{ matches: FdMatch[] }>(`/competitions/${code}/matches`);

    for (const m of matchesRes.matches) {
      const homeTeamId = teamIdByExternalId.get(m.homeTeam.id);
      const awayTeamId = teamIdByExternalId.get(m.awayTeam.id);
      if (!homeTeamId || !awayTeamId) {
        skipped++;
        continue;
      }
      await upsertMatch(sql, season.id, homeTeamId, awayTeamId, m);
      processed++;
    }

    // อัปเดต current_matchday ด้วย ไม่งั้นหน้าเว็บจะค้างอยู่แมตช์เดย์เดิมทั้งฤดูกาล
    const competition = await fdFetch<{ currentSeason: { currentMatchday: number | null } }>(
      `/competitions/${code}`,
    );
    await sql`
      update seasons set current_matchday = ${competition.currentSeason.currentMatchday}
      where id = ${season.id}
    `;
    matchdays[code] = competition.currentSeason.currentMatchday;
    log(`[${code}] sync ผลเสร็จ · แมตช์เดย์ ${competition.currentSeason.currentMatchday}`);
  }

  return { processed, skipped, matchdays };
}
