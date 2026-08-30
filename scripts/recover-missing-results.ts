import './lib/prefer-ipv4';

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// กู้ผลแมตช์ที่ /matches ของ football-data "ค้าง" ไม่ยอมส่งผลมา ทั้งที่นัดเตะจบไปแล้ว
//
// ที่มาของปัญหา (เกิดจริงบน prod 2026-08-30): แผนฟรีของ football-data ส่งข้อมูลสองเส้นไม่ตรงกัน
//   /standings → นับนัดเมื่อวานเรียบร้อย (Hull/Newcastle/Everton/Liverpool แข่ง 2 นัดแล้ว)
//   /matches   → ยังเป็น TIMED ไม่มีสกอร์ ทั้งที่คิกออฟผ่านไปเป็นวัน
// ระบบ sync อ่านจาก /matches จึงมองไม่เห็นผล นัดค้างเป็น "ยังไม่จบ" ไม่มีวันถูกคิดคะแนน
//
// วิธีกู้: ไม่เดาสกอร์ แต่ "หักลบ" เอาจากยอดสะสมในตารางคะแนน
//   ผลนัดที่หาย = ยอดสะสมของทีมจาก /standings − ผลรวมนัดที่ DB เรามีครบแล้ว
// ใช้ได้เมื่อทีมนั้นเหลือนัดที่หายอยู่ "นัดเดียว" เท่านั้น แล้วเช็คไขว้กับอีกฝั่งว่าสกอร์ตรงกัน
// แบบกระจกเงา (เจ้าบ้านยิง = ทีมเยือนเสีย) และผลแพ้ชนะสอดคล้องกับช่อง W/D/L ทั้งสองฝั่ง
// ถ้าเงื่อนไขไหนไม่ครบ = ข้าม ไม่แตะ ดีกว่าเดาผิดแล้วแจกแต้มมั่ว
//
// ใช้: npx tsx scripts/recover-missing-results.ts          (ดูอย่างเดียว ไม่เขียน)
//      npx tsx scripts/recover-missing-results.ts --yes    (เขียนจริง)
// เขียนเสร็จต้องรัน npm run db:score ต่อ เพื่อให้คิดคะแนนใหม่ (result_version ถูก bump ไว้แล้ว)

const APPLY = process.argv.includes('--yes');

type StandingsResponse = {
  standings: {
    type: string;
    table: {
      team: { id: number; shortName: string | null; name: string };
      playedGames: number;
      won: number;
      draw: number;
      lost: number;
      goalsFor: number;
      goalsAgainst: number;
    }[];
  }[];
};

type DbMatch = {
  id: string;
  matchday: number;
  status: string;
  home_score: number | null;
  away_score: number | null;
  kickoff_at: string;
  past: boolean;
  home_ext: number;
  away_ext: number;
  home_name: string;
  away_name: string;
};

type Agg = { played: number; won: number; draw: number; lost: number; gf: number; ga: number };

const zero = (): Agg => ({ played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0 });

async function main() {
  const { sqlClient } = await import('../src/db/client');
  const { COMPETITIONS } = await import('../src/lib/football/competitions');
  const { fdFetch } = await import('../src/lib/jobs/sync-results');

  console.log(`target: ${new URL(process.env.DATABASE_URL ?? '').host}`);
  console.log(APPLY ? 'โหมด: เขียนจริง (--yes)\n' : 'โหมด: ดูอย่างเดียว (ใส่ --yes เพื่อเขียนจริง)\n');

  const fixes: { id: string; label: string; hs: number; as: number }[] = [];

  try {
    for (const comp of COMPETITIONS) {
      const [season] = await sqlClient<{ id: string }[]>`
        select id from seasons
        where competition_code = ${comp.code} and is_active = true limit 1
      `;
      if (!season) {
        console.log(`[${comp.code}] ไม่มีฤดูกาล active — ข้าม\n`);
        continue;
      }

      const rows = await sqlClient<DbMatch[]>`
        select m.id, m.matchday, m.status::text as status, m.home_score, m.away_score,
          m.kickoff_at::text as kickoff_at, (m.kickoff_at <= now()) as past,
          ht.external_id as home_ext, at.external_id as away_ext,
          coalesce(ht.short_name, ht.name) as home_name,
          coalesce(at.short_name, at.name) as away_name
        from matches m
        join teams ht on ht.id = m.home_team_id
        join teams at on at.id = m.away_team_id
        where m.season_id = ${season.id}::uuid
        order by m.kickoff_at
      `;

      // ผลรวมของนัดที่ DB เรามีครบแล้ว (จบ + มีสกอร์) — ฐานสำหรับหักลบ
      const ours = new Map<number, Agg>();
      const inPlay = new Set<number>();
      const stuckByTeam = new Map<number, DbMatch[]>();

      const add = (ext: number, gf: number, ga: number) => {
        const a = ours.get(ext) ?? zero();
        a.played++;
        a.gf += gf;
        a.ga += ga;
        if (gf > ga) a.won++;
        else if (gf === ga) a.draw++;
        else a.lost++;
        ours.set(ext, a);
      };

      for (const m of rows) {
        const done = m.status === 'FINISHED' && m.home_score !== null && m.away_score !== null;
        if (done) {
          add(m.home_ext, m.home_score!, m.away_score!);
          add(m.away_ext, m.away_score!, m.home_score!);
          continue;
        }
        // นัดที่กำลังเตะทำให้ยอดใน /standings ขยับก่อนจบ — กันไว้ไม่ให้ทีมนั้นถูกหักลบผิด
        if (m.status === 'IN_PLAY' || m.status === 'PAUSED') {
          inPlay.add(m.home_ext);
          inPlay.add(m.away_ext);
          continue;
        }
        if (!m.past) continue; // ยังไม่ถึงเวลาเตะ = ไม่ใช่นัดที่หาย
        for (const ext of [m.home_ext, m.away_ext]) {
          stuckByTeam.set(ext, [...(stuckByTeam.get(ext) ?? []), m]);
        }
      }

      const standings = await fdFetch<StandingsResponse>(`/competitions/${comp.code}/standings`);
      const table = standings.standings.find((s) => s.type === 'TOTAL')?.table ?? [];
      const official = new Map<number, Agg & { name: string }>();
      for (const r of table) {
        official.set(r.team.id, {
          name: r.team.shortName ?? r.team.name,
          played: r.playedGames,
          won: r.won,
          draw: r.draw,
          lost: r.lost,
          gf: r.goalsFor,
          ga: r.goalsAgainst,
        });
      }

      const stuck = rows.filter(
        (m) =>
          m.past &&
          m.status !== 'IN_PLAY' &&
          m.status !== 'PAUSED' &&
          !(m.status === 'FINISHED' && m.home_score !== null && m.away_score !== null),
      );

      console.log(`[${comp.code}] นัดที่เตะไปแล้วแต่ DB ไม่มีผล: ${stuck.length} นัด`);

      for (const m of stuck) {
        const label = `MD${m.matchday} ${m.home_name} vs ${m.away_name} (${m.status})`;
        const oh = official.get(m.home_ext);
        const oa = official.get(m.away_ext);
        if (!oh || !oa) {
          console.log(`  ✗ ${label} — ไม่มีทีมนี้ในตารางคะแนน`);
          continue;
        }
        if (inPlay.has(m.home_ext) || inPlay.has(m.away_ext)) {
          console.log(`  – ${label} — มีนัดกำลังเตะอยู่ ยอดสะสมยังไม่นิ่ง ข้ามไว้ก่อน`);
          continue;
        }
        if ((stuckByTeam.get(m.home_ext)?.length ?? 0) > 1 || (stuckByTeam.get(m.away_ext)?.length ?? 0) > 1) {
          console.log(`  – ${label} — ทีมนี้ขาดผลมากกว่า 1 นัด แยกสกอร์ไม่ได้`);
          continue;
        }

        const bh = ours.get(m.home_ext) ?? zero();
        const ba = ours.get(m.away_ext) ?? zero();
        const rh = {
          played: oh.played - bh.played, gf: oh.gf - bh.gf, ga: oh.ga - bh.ga,
          won: oh.won - bh.won, draw: oh.draw - bh.draw, lost: oh.lost - bh.lost,
        };
        const ra = {
          played: oa.played - ba.played, gf: oa.gf - ba.gf, ga: oa.ga - ba.ga,
          won: oa.won - ba.won, draw: oa.draw - ba.draw, lost: oa.lost - ba.lost,
        };

        if (rh.played !== 1 || ra.played !== 1) {
          console.log(
            `  – ${label} — ส่วนต่างไม่ลงตัวที่ 1 นัด (เจ้าบ้าน ${rh.played}, ทีมเยือน ${ra.played})` +
            ' — ตารางคะแนนอาจยังไม่รวมนัดนี้',
          );
          continue;
        }
        const hs = rh.gf;
        const as = rh.ga;
        const mirrorOk = ra.gf === as && ra.ga === hs;
        const wdlOk =
          (hs > as && rh.won === 1 && ra.lost === 1) ||
          (hs === as && rh.draw === 1 && ra.draw === 1) ||
          (hs < as && rh.lost === 1 && ra.won === 1);
        if (!mirrorOk || !wdlOk || hs < 0 || as < 0) {
          console.log(`  ✗ ${label} — เช็คไขว้ไม่ผ่าน (เจ้าบ้านได้ ${hs}-${as}, อีกฝั่งบอก ${ra.ga}-${ra.gf}) ไม่แตะ`);
          continue;
        }

        console.log(`  ✓ ${label} → ${hs}-${as}`);
        fixes.push({ id: m.id, label, hs, as });
      }
      console.log();
    }

    if (fixes.length === 0) {
      console.log('ไม่มีนัดที่กู้ได้ในรอบนี้');
      return;
    }
    if (!APPLY) {
      console.log(`สรุป: กู้ได้ ${fixes.length} นัด — รันซ้ำด้วย --yes เพื่อเขียนจริง`);
      return;
    }

    for (const f of fixes) {
      await sqlClient`
        update matches
        set status = 'FINISHED', home_score = ${f.hs}, away_score = ${f.as},
            result_version = result_version + 1, last_synced_at = now()
        where id = ${f.id}::uuid
      `;
    }
    console.log(`เขียนผลกลับเข้า DB แล้ว ${fixes.length} นัด — ต่อไปรัน: npm run db:score`);
  } finally {
    await sqlClient.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
