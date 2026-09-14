import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

import { competitionByCode } from '@/lib/football/competitions';

config({ path: path.resolve(__dirname, '../.env.local') });

// รายงานสภาพข้อมูลของแต่ละลีกฟุตบอลในฐานข้อมูล
//
// มีไว้ตอบคำถามแบบ "ทำไมมันแสดงแค่แมตช์เดย์ 1" ให้ได้ด้วยข้อมูลจริง แทนที่จะเดา — เพราะคำตอบ
// อาจเป็นได้ทั้ง "ฤดูกาลเพิ่งเริ่มจริง ๆ", "sync ดึงมาไม่ครบ" หรือ "current_matchday ค้าง"
// ซึ่งแก้คนละทางกันหมด
//
// รัน: npm run db:season-status
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing DATABASE_URL ใน .env.local');
  const sql = postgres(connectionString, { prepare: false });

  try {
    const rows = await sql<
      {
        id: string;
        competition_code: string;
        name: string;
        current_matchday: number | null;
        is_active: boolean;
        total_matches: number;
        min_md: number | null;
        max_md: number | null;
        finished: number;
        upcoming: number;
        next_kickoff: string | null;
      }[]
    >`
      select
        s.id, s.competition_code, s.name, s.current_matchday, s.is_active,
        count(m.id)::int as total_matches,
        min(m.matchday) as min_md,
        max(m.matchday) as max_md,
        count(*) filter (where m.status = 'FINISHED')::int as finished,
        count(*) filter (where m.kickoff_at > now())::int as upcoming,
        min(m.kickoff_at) filter (where m.kickoff_at > now())::text as next_kickoff
      from seasons s
      left join matches m on m.season_id = s.id
      group by s.id, s.competition_code, s.name, s.current_matchday, s.is_active
      order by s.is_active desc, s.competition_code
    `;

    for (const r of rows) {
      // โชว์ฤดูกาลที่ปิดแล้วด้วย (db:season-active --off) จะได้เห็นว่ามันปิดจริง ไม่ใช่หายไปเฉย ๆ
      console.log(`\n[${r.competition_code}] ${r.name}${r.is_active ? '' : '  (ปิดอยู่)'}`);
      if (!r.is_active) continue;
      console.log(`  แมตช์เดย์ปัจจุบัน (ที่ระบบใช้): ${r.current_matchday ?? '(ไม่ได้ตั้ง)'}`);
      console.log(`  แมตช์ในฐานข้อมูล: ${r.total_matches} นัด (แมตช์เดย์ ${r.min_md} ถึง ${r.max_md})`);
      console.log(`  จบแล้ว ${r.finished} · ยังไม่เตะ ${r.upcoming}`);
      console.log(`  นัดถัดไป: ${r.next_kickoff ?? '(ไม่มี)'}`);

      // รอบ (stage) ที่มีในโปรแกรม — บอลถ้วยต้องดูตรงนี้ว่าเลขแมตช์เดย์ของรอบน็อกเอาต์ "นับต่อ"
      // จากรอบลีกหรือเปล่า (ดูคอมเมนต์ CL ใน competitions.ts) ถ้าเลขซ้ำกันข้ามรอบ ระบบจะปนรอบกัน
      const stages = await sql<{ stage: string | null; min_md: number; max_md: number; n: number }[]>`
        select stage, min(matchday) as min_md, max(matchday) as max_md, count(*)::int as n
        from matches where season_id = ${r.id}
        group by stage order by min(matchday)
      `;
      if (stages.length > 1 || stages[0]?.stage) {
        console.log(
          `  รอบ: ${stages.map((s) => `${s.stage ?? '(ไม่ระบุ)'} md ${s.min_md}-${s.max_md} (${s.n} นัด)`).join(' · ')}`,
        );
      }

      // จำนวนแมตช์เดย์ที่ควรมีอยู่ใน competitions.ts (PL 38, CL รอบลีก 8) — น้อยกว่านั้นแปลว่า sync ไม่ครบ
      const expected = competitionByCode(r.competition_code)?.expectedMatchdays ?? 30;
      if ((r.max_md ?? 0) < expected) {
        console.log(`  ⚠️  แมตช์เดย์สูงสุดแค่ ${r.max_md} (ควรมี ${expected}) — น่าจะ sync โปรแกรมแข่งมาไม่ครบ`);
        console.log(`     แก้ด้วย: npm run db:sync-fixtures -- --code=${r.competition_code}`);
      }

      // นับจากผลที่จบจริง ว่าควรอยู่แมตช์เดย์ไหน เทียบกับที่ระบบใช้อยู่
      const [{ played_md: playedMd }] = await sql<{ played_md: number | null }[]>`
        select max(m.matchday) as played_md
        from matches m
        join seasons s on s.id = m.season_id
        where s.competition_code = ${r.competition_code} and m.status = 'FINISHED'
      `;
      if (playedMd != null && r.current_matchday != null && playedMd > r.current_matchday) {
        console.log(
          `  ⚠️  มีนัดจบถึงแมตช์เดย์ ${playedMd} แล้ว แต่ระบบยังชี้ที่ ${r.current_matchday}`,
        );
        console.log('     แก้ด้วย: npm run db:sync-results');
      }
    }

    console.log(
      '\nหมายเหตุ: "แมตช์เดย์ปัจจุบัน" คำนวณจากนัดถัดไปที่ยังไม่คิกออฟในโปรแกรมแข่งของ DB' +
        '\n(ดู lib/matches/current-matchday.ts) ไม่ได้เชื่อค่า currentMatchday ของ football-data.org\n',
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('อ่านสถานะฤดูกาลล้มเหลว:', err);
  process.exit(1);
});
