import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// ล้างข้อมูล "การเล่น" ทั้งหมด แต่เก็บข้อมูลฟุตบอลไว้ — ใช้ตอนอยากเริ่มใหม่หลังทดสอบจนข้อมูลมั่ว
//
// ลบ: predictions, prediction_scores, ai_prediction_logs, leagues (+league_members ตาม cascade),
//     articles, cron_runs
// เก็บ: seasons, teams, matches (ข้อมูลฟุตบอล), users/accounts/sessions (ไม่ต้อง login ใหม่),
//       ai_agents (ผู้เล่น AI ที่ seed ไว้แล้ว)
//
// ต่างจาก db:reset ที่ drop ทั้ง schema แล้วสร้างใหม่หมด (ต้อง sync ใหม่ + login ใหม่ + seed ใหม่)
//
// สำคัญ: ถ้าเคยรัน test-simulate-finish.ts แก้สถานะแมตช์เป็น FINISHED ด้วยสกอร์ปลอม สคริปต์นี้
// ไม่ได้แก้กลับให้ ต้องรัน npm run db:sync-results ต่อเพื่อดึงสถานะจริงจาก football-data.org มาทับ
//
// รัน: npm run db:reset-play -- --yes

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL ใน .env.local');
  }
  if (!process.argv.includes('--yes')) {
    console.error('คำสั่งนี้ลบข้อมูลถาวร ต้องยืนยันด้วย: npm run db:reset-play -- --yes');
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false });

  try {
    // ทำใน transaction เดียว — ถ้าพังกลางทางจะ rollback ทั้งหมด ไม่เหลือสถานะครึ่ง ๆ กลาง ๆ
    // ลำดับการลบไล่จากตารางลูกไปหาแม่ เพื่อไม่ให้ชน foreign key
    await sql.begin(async (tx) => {
      const counts: Record<string, number> = {};

      counts.prediction_scores = (await tx`delete from prediction_scores returning id`).length;
      counts.ai_prediction_logs = (await tx`delete from ai_prediction_logs returning id`).length;
      counts.predictions = (await tx`delete from predictions returning id`).length;
      counts.league_members = (await tx`delete from league_members returning id`).length;
      counts.leagues = (await tx`delete from leagues returning id`).length;
      counts.articles = (await tx`delete from articles returning id`).length;
      counts.cron_runs = (await tx`delete from cron_runs returning id`).length;

      for (const [table, n] of Object.entries(counts)) {
        console.log(`  ลบ ${table}: ${n} แถว`);
      }
    });

    const [remaining] = await sql<
      { seasons: number; teams: number; matches: number; users: number; ai_agents: number }[]
    >`
      select
        (select count(*) from seasons)::int as seasons,
        (select count(*) from teams)::int as teams,
        (select count(*) from matches)::int as matches,
        (select count(*) from users)::int as users,
        (select count(*) from ai_agents)::int as ai_agents
    `;
    console.log('\nเหลืออยู่:');
    console.log(`  seasons: ${remaining.seasons}, teams: ${remaining.teams}, matches: ${remaining.matches}`);
    console.log(`  users: ${remaining.users}, ai_agents: ${remaining.ai_agents}`);
    console.log('\nขั้นต่อไป: npm run db:sync-results  (ดึงสถานะแมตช์จริงมาทับข้อมูลที่แก้มือตอนทดสอบ)');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('รีเซ็ตล้มเหลว:', err);
  process.exit(1);
});
