import type postgres from 'postgres';
import { syncCurrentMatchdayColumn } from '@/lib/matches/current-matchday';

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
//
// windowDays: จำกัดช่วงวันที่ดึงมาจาก football-data.org (ย้อนหลัง/ล่วงหน้ากี่วัน) — จำเป็นตอนรัน
// เป็น cron บน Vercel เพราะฟังก์ชันมีเพดานเวลา 60 วิ ถ้าดึงทั้งฤดูกาล (~380 นัดต่อลีก) มา upsert
// ทีละแถวจะไม่ทันเวลา แต่ cron ทุก 30 นาทีสนใจแค่นัดที่เพิ่งจบ/ใกล้จะแข่งเท่านั้น โปรแกรมแข่งทั้ง
// ฤดูกาลถูก sync ครบไว้แล้วตอนรัน db:sync-fixtures ครั้งแรก ไม่ต้องดึงซ้ำทุกรอบ
// ไม่ใส่ค่านี้ (undefined) = ดึงทั้งฤดูกาล ใช้ตอนรันเองจากเครื่อง (npm run db:sync-results)
export async function runSyncResults(
  sql: postgres.Sql,
  log = console.log,
  options?: { windowDays?: number },
) {
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

  const dateRangeQuery = (() => {
    if (!options?.windowDays) return '';
    const toIso = (d: Date) => d.toISOString().slice(0, 10);
    const now = new Date();
    const from = new Date(now.getTime() - options.windowDays * 86_400_000);
    const to = new Date(now.getTime() + options.windowDays * 86_400_000);
    return `?dateFrom=${toIso(from)}&dateTo=${toIso(to)}`;
  })();

  for (const season of seasons) {
    const code = season.competition_code;
    const matchesRes = await fdFetch<{ matches: FdMatch[] }>(
      `/competitions/${code}/matches${dateRangeQuery}`,
    );

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

    // อัปเดต current_matchday จากโปรแกรมแข่งที่เพิ่ง sync มา ไม่ใช่จากค่า currentMatchday ของ
    // football-data.org — ค่าของเขาเดินหน้าก่อนที่แมตช์เดย์ปัจจุบันจะเตะครบ (ดูเหตุผลเต็ม ๆ ใน
    // lib/matches/current-matchday.ts) ประหยัด request ไปได้อีก 1 ครั้งต่อลีกด้วย
    const md = await syncCurrentMatchdayColumn([season.id], sql);
    matchdays[code] = md.get(season.id) ?? null;
    log(`[${code}] sync ผลเสร็จ · แมตช์เดย์ ${matchdays[code]}`);
  }

  return { processed, skipped, matchdays };
}
