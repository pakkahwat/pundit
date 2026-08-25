import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

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
        competition_code: string;
        name: string;
        current_matchday: number | null;
        total_matches: number;
        min_md: number | null;
        max_md: number | null;
        finished: number;
        upcoming: number;
        next_kickoff: string | null;
      }[]
    >`
      select
        s.competition_code, s.name, s.current_matchday,
        count(m.id)::int as total_matches,
        min(m.matchday) as min_md,
        max(m.matchday) as max_md,
        count(*) filter (where m.status = 'FINISHED')::int as finished,
        count(*) filter (where m.kickoff_at > now())::int as upcoming,
        min(m.kickoff_at) filter (where m.kickoff_at > now())::text as next_kickoff
      from seasons s
      left join matches m on m.season_id = s.id
      where s.is_active = true
      group by s.id, s.competition_code, s.name, s.current_matchday
      order by s.competition_code
    `;

    for (const r of rows) {
      console.log(`\n[${r.competition_code}] ${r.name}`);
      console.log(`  แมตช์เดย์ปัจจุบัน (ที่ระบบใช้): ${r.current_matchday ?? '(ไม่ได้ตั้ง)'}`);
      console.log(`  แมตช์ในฐานข้อมูล: ${r.total_matches} นัด (แมตช์เดย์ ${r.min_md} ถึง ${r.max_md})`);
      console.log(`  จบแล้ว ${r.finished} · ยังไม่เตะ ${r.upcoming}`);
      console.log(`  นัดถัดไป: ${r.next_kickoff ?? '(ไม่มี)'}`);

      // ลีกใหญ่ ๆ มี 38 แมตช์เดย์ (20 ทีม) — ถ้าดึงมาได้น้อยกว่านั้นมากแปลว่า sync ไม่ครบ
      if ((r.max_md ?? 0) < 30) {
        console.log(`  ⚠️  แมตช์เดย์สูงสุดแค่ ${r.max_md} — น่าจะ sync โปรแกรมแข่งมาไม่ครบ`);
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
      '\nหมายเหตุ: หน้าทายผลแสดงเฉพาะ "แมตช์เดย์ปัจจุบัน" เท่านั้น' +
        '\nค่านี้มาจาก football-data.org ตอนรัน sync-results ไม่ได้คำนวณเอง\n',
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('อ่านสถานะฤดูกาลล้มเหลว:', err);
  process.exit(1);
});
