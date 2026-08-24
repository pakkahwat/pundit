import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// สคริปต์เทสเฉพาะกิจ (dev-only) — จำลอง "แมตช์จบแล้ว" โดยไม่ต้องไล่หาแถวเองใน Drizzle Studio
// หาแมตช์ที่มีคนทายไว้ล่าสุด (จากตาราง predictions) แล้ว mark เป็น FINISHED + ใส่สกอร์ + bump
// result_version ให้เอง ใช้สำหรับเทส npm run db:score เท่านั้น ห้ามรันใน production จริง
//
// ใช้: npx tsx scripts/test-simulate-finish.ts
// (ใส่สกอร์เองได้ ไม่งั้น default 2-1): npx tsx scripts/test-simulate-finish.ts 3 0

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL ใน .env.local');
  }
  const sql = postgres(connectionString, { prepare: false });

  const homeScore = Number(process.argv[2] ?? 2);
  const awayScore = Number(process.argv[3] ?? 1);

  try {
    const [match] = await sql<
      { id: string; home_name: string; away_name: string; status: string; result_version: number }[]
    >`
      select m.id, ht.name as home_name, at.name as away_name, m.status, m.result_version
      from predictions p
      join matches m on m.id = p.match_id
      join teams ht on ht.id = m.home_team_id
      join teams at on at.id = m.away_team_id
      order by p.submitted_at desc
      limit 1
    `;

    if (!match) {
      console.error('ไม่เจอ prediction ไหนเลยในตาราง predictions — ไปทายผลสักแมตช์ในหน้าเว็บก่อน');
      process.exit(1);
    }

    console.log(`เจอแมตช์ล่าสุดที่มีคนทาย: ${match.home_name} vs ${match.away_name}`);
    console.log(`  สถานะเดิม: ${match.status}, result_version เดิม: ${match.result_version}`);

    await sql`
      update matches
      set status = 'FINISHED',
          home_score = ${homeScore},
          away_score = ${awayScore},
          result_version = result_version + 1
      where id = ${match.id}
    `;

    console.log(`อัปเดตเป็น FINISHED ${homeScore}-${awayScore} แล้ว (result_version +1)`);
    console.log('ต่อไปรัน: npm run db:score');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('ล้มเหลว:', err);
  process.exit(1);
});
