import type postgres from 'postgres';

import { COMPETITIONS, competitionByCode } from '@/lib/football/competitions';

import { fdFetch, upsertMatch, type FdMatch } from './sync-results';

type Competition = {
  id: number;
  code: string;
  name: string;
  currentSeason: { startDate: string; currentMatchday: number | null };
};
type Team = { id: number; name: string; shortName: string; tla: string; crest: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// sync "เต็ม" ของลีกหนึ่ง — ตั้ง season + ดึงทีมทั้งหมด + ดึงโปรแกรมแข่งทั้งฤดูกาล
// ใช้ 3 requests ต่อลีก จึงเหมาะกับการรันนาน ๆ ครั้ง (ตอนเปิดซีซันหรือเพิ่มลีกใหม่)
// ระหว่างซีซันใช้ runSyncResults แทน ซึ่งใช้แค่ 2 requests ต่อลีกและไม่แตะตารางทีม
export async function runSyncFixturesFor(sql: postgres.Sql, code: string, log = console.log) {
  const cfg = competitionByCode(code);
  if (!cfg) {
    throw new Error(`ไม่รู้จักลีกรหัส ${code} — เพิ่มใน src/lib/football/competitions.ts ก่อน`);
  }

  log(`[${code}] ดึงข้อมูลลีก...`);
  const competition = await fdFetch<Competition>(`/competitions/${code}`);
  const year = new Date(competition.currentSeason.startDate).getFullYear();
  const seasonName = `${competition.name} ${year}/${String(year + 1).slice(2)}`;

  const [{ id: seasonId }] = await sql<{ id: string }[]>`
    insert into seasons (external_competition_id, competition_code, name, year, current_matchday, is_active)
    values (
      ${competition.id}, ${competition.code}, ${seasonName}, ${year},
      ${competition.currentSeason.currentMatchday}, true
    )
    on conflict (competition_code, year) do update set
      current_matchday = excluded.current_matchday,
      name = excluded.name,
      is_active = true
    returning id
  `;
  log(`[${code}] season: ${seasonName}`);

  log(`[${code}] ดึงทีม...`);
  const teamsRes = await fdFetch<{ teams: Team[] }>(`/competitions/${code}/teams`);
  for (const t of teamsRes.teams) {
    await sql`
      insert into teams (external_id, name, short_name, tla, crest_url)
      values (${t.id}, ${t.name}, ${t.shortName}, ${t.tla}, ${t.crest})
      on conflict (external_id) do update set
        name = excluded.name,
        short_name = excluded.short_name,
        tla = excluded.tla,
        crest_url = excluded.crest_url
    `;
  }
  log(`[${code}] อัปเดต ${teamsRes.teams.length} ทีม`);

  const teamRows = await sql<{ id: string; external_id: number }[]>`
    select id, external_id from teams
  `;
  const teamIdByExternalId = new Map(teamRows.map((t) => [t.external_id, t.id]));

  log(`[${code}] ดึงโปรแกรมแข่ง...`);
  const matchesRes = await fdFetch<{ matches: FdMatch[] }>(`/competitions/${code}/matches`);

  let processed = 0;
  let skipped = 0;
  for (const m of matchesRes.matches) {
    const homeTeamId = teamIdByExternalId.get(m.homeTeam.id);
    const awayTeamId = teamIdByExternalId.get(m.awayTeam.id);
    if (!homeTeamId || !awayTeamId) {
      skipped++;
      continue;
    }
    await upsertMatch(sql, seasonId, homeTeamId, awayTeamId, m);
    processed++;
  }
  log(`[${code}] sync ${processed} แมตช์ (ข้าม ${skipped})`);

  return { processed, skipped, seasonId };
}

// sync ทุกลีกที่ตั้งไว้ใน COMPETITIONS — หน่วงเวลาระหว่างลีกเพราะแผนฟรีจำกัด 10 requests/นาที
// และแต่ละลีกใช้ 3 requests ถ้ายิงติด ๆ กันหลายลีกจะโดน 429
export async function runSyncFixtures(
  sql: postgres.Sql,
  codes: string[] = COMPETITIONS.map((c) => c.code),
  log = console.log,
) {
  let processed = 0;
  for (const [i, code] of codes.entries()) {
    if (i > 0) {
      log('รอ 20 วินาทีก่อนลีกถัดไป (กัน rate limit ของแผนฟรี)...');
      await sleep(20_000);
    }
    const result = await runSyncFixturesFor(sql, code, log);
    processed += result.processed;
  }
  return { processed };
}
