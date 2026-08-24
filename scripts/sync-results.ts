import './lib/prefer-ipv4'; // ต้องมาก่อน import อื่นที่ใช้เน็ต (ดูเหตุผลในไฟล์นั้น)

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// sync ผลแข่งของทุกลีกที่ active — ตรรกะจริงอยู่ใน src/lib/jobs/sync-results.ts ซึ่งเป็นโค้ด
// ชุดเดียวกับที่ route /api/cron/sync-results บน production เรียกใช้
// รัน: npm run db:sync-results

async function main() {
  const { sqlClient } = await import('../src/db/client');
  const { runSyncResults } = await import('../src/lib/jobs/sync-results');
  const { withCronRun } = await import('../src/lib/jobs/cron-run');

  try {
    const result = await withCronRun(sqlClient, 'sync_results', () => runSyncResults(sqlClient));
    console.log(`\nรวม sync ผล ${result.processed} แมตช์ (ข้าม ${result.skipped})`);
  } finally {
    await sqlClient.end();
  }
}

main().catch((err) => {
  console.error('Sync ผลล้มเหลว:', err);
  process.exit(1);
});
