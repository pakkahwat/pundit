import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// ดูประวัติงาน cron ล่าสุดพร้อมข้อความ error เต็ม ๆ (อ่านอย่างเดียว)
// หน้า /admin โชว์แค่สรุป — ตัวนี้เอาไว้อ่าน stack/ข้อความจริงตอนไล่เหตุ 500
//
// ใช้: npx tsx scripts/debug-cron-runs.ts          (20 รอบล่าสุดทุกงาน)
//      npx tsx scripts/debug-cron-runs.ts sync_results   (เฉพาะงานนั้น)

const jobFilter = process.argv[2];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing DATABASE_URL');
  console.log(`target: ${new URL(connectionString).host}\n`);
  const sql = postgres(connectionString, { max: 1 });
  try {
    const rows = await sql<
      {
        job_name: string; status: string | null; started_at: string;
        finished_at: string | null; processed_count: number | null; error: string | null;
        secs: number | null;
      }[]
    >`
      select job_name, status, processed_count, error,
        to_char(started_at at time zone 'Asia/Bangkok', 'MM-DD HH24:MI:SS') as started_at,
        to_char(finished_at at time zone 'Asia/Bangkok', 'MM-DD HH24:MI:SS') as finished_at,
        extract(epoch from (finished_at - started_at))::int as secs
      from cron_runs
      ${jobFilter ? sql`where job_name = ${jobFilter}` : sql``}
      order by started_at desc
      limit 20
    `;
    for (const r of rows) {
      const mark = r.status === 'success' ? '✓' : r.status === 'error' ? '✗' : '…';
      console.log(
        `${mark} ${r.started_at} ${r.job_name} · ${r.status}` +
        `${r.secs !== null ? ` · ${r.secs}s` : ''}` +
        `${r.processed_count !== null ? ` · ${r.processed_count} รายการ` : ''}`,
      );
      if (r.error) console.log(`    ${r.error}`);
    }
    if (rows.length === 0) console.log('ไม่มีประวัติ cron เลย');
  } finally {
    await sql.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
