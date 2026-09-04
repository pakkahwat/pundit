import './lib/prefer-ipv4';

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// จำลองงาน sync-results รอบ cron (windowDays = 10) เพื่อหา "นัดที่ทำ upsert พัง"
// ทุกอย่างทำใน transaction ที่ rollback ทิ้งเสมอ — ไม่มีการเขียนจริงแม้แต่แถวเดียว
//
// ใช้: npx tsx scripts/debug-sync-window.ts

const WINDOW_DAYS = 10;
const ALLOWED = new Set([
  'SCHEDULED', 'TIMED', 'POSTPONED', 'SUSPENDED', 'CANCELLED',
  'IN_PLAY', 'PAUSED', 'FINISHED', 'AWARDED',
]);

async function main() {
  const { sqlClient } = await import('../src/db/client');
  const { COMPETITIONS } = await import('../src/lib/football/competitions');
  const { fdFetch, upsertMatch } = await import('../src/lib/jobs/sync-results');

  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const range =
    `?dateFrom=${toIso(new Date(now.getTime() - WINDOW_DAYS * 86_400_000))}` +
    `&dateTo=${toIso(new Date(now.getTime() + WINDOW_DAYS * 86_400_000))}`;
  console.log(`ช่วงวันที่ที่ cron ใช้: ${range}\n`);

  const teamRows = await sqlClient<{ id: string; external_id: number }[]>`
    select id, external_id from teams
  `;
  const teamIdByExternalId = new Map(teamRows.map((t) => [t.external_id, t.id]));

  try {
    for (const comp of COMPETITIONS) {
      const [season] = await sqlClient<{ id: string }[]>`
        select id from seasons where competition_code = ${comp.code} and is_active = true limit 1
      `;
      if (!season) continue;

      const res = await fdFetch<{ matches: Record<string, unknown>[] }>(
        `/competitions/${comp.code}/matches${range}`,
      );
      console.log(`[${comp.code}] ได้มา ${res.matches.length} นัด`);

      // 1) ตรวจรูปร่างข้อมูลก่อน — ฟิลด์แปลก ๆ มักเป็นต้นเหตุจริง
      for (const raw of res.matches) {
        const m = raw as {
          id: number; utcDate: string; status: string; matchday: number | null;
          score?: { fullTime?: { home: number | null; away: number | null } };
          homeTeam?: { id: number }; awayTeam?: { id: number };
        };
        const problems: string[] = [];
        if (typeof m.status !== 'string') problems.push(`status ไม่ใช่ string: ${JSON.stringify(m.status)}`);
        else if (!ALLOWED.has(m.status)) problems.push(`status นอกรายการ enum: "${m.status}"`);
        if (typeof m.utcDate !== 'string') problems.push(`utcDate ผิดรูป: ${JSON.stringify(m.utcDate)}`);
        if (m.matchday === undefined) problems.push('ไม่มีฟิลด์ matchday');
        if (!m.score?.fullTime) problems.push('ไม่มี score.fullTime');
        if (!m.homeTeam?.id || !m.awayTeam?.id) problems.push('ไม่มี id ของทีม');
        if (problems.length > 0) {
          console.log(`  ⚠ id=${m.id} ${m.utcDate} — ${problems.join(' | ')}`);
          console.log(`    ${JSON.stringify(raw).slice(0, 400)}`);
        }
      }

      // 2) ลอง upsert จริงทีละนัดใน transaction แล้ว rollback — เจอตัวที่พังจะโชว์ JSON เต็ม
      let failed = 0;
      for (const raw of res.matches) {
        const m = raw as Parameters<typeof upsertMatch>[4];
        const home = teamIdByExternalId.get((m as unknown as { homeTeam: { id: number } }).homeTeam.id);
        const away = teamIdByExternalId.get((m as unknown as { awayTeam: { id: number } }).awayTeam.id);
        if (!home || !away) continue;
        try {
          await sqlClient.begin(async (tx) => {
            await upsertMatch(tx as unknown as typeof sqlClient, season.id, home, away, m);
            throw new Error('__rollback__');
          });
        } catch (err) {
          if (err instanceof Error && err.message === '__rollback__') continue;
          failed++;
          console.log(`  ✗ upsert พัง: ${String(err)}`);
          console.log(`    ${JSON.stringify(raw)}`);
        }
      }
      console.log(`[${comp.code}] นัดที่ upsert พัง: ${failed}\n`);
    }
  } finally {
    await sqlClient.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
