import './lib/prefer-ipv4'; // ต้องมาก่อน import อื่นที่ใช้เน็ต (ดูเหตุผลในไฟล์นั้น)

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// sync เต็มของลีกที่กำหนด (season + ทีม + โปรแกรมแข่งทั้งฤดูกาล) — รันนาน ๆ ครั้ง
// ตรรกะจริงอยู่ใน src/lib/jobs/sync-fixtures.ts
//
// ใช้งาน:
//   npm run db:sync-fixtures              sync ทุกลีกที่ตั้งไว้ใน competitions.ts
//   npm run db:sync-fixtures -- --code=PD  sync เฉพาะลาลีกา
//
// ระหว่างซีซันใช้ npm run db:sync-results แทน (เบากว่า ไม่แตะตารางทีม)

async function main() {
  const { sqlClient } = await import('../src/db/client');
  const { runSyncFixtures } = await import('../src/lib/jobs/sync-fixtures');
  const { withCronRun } = await import('../src/lib/jobs/cron-run');
  const { COMPETITIONS } = await import('../src/lib/football/competitions');

  const codeArg = process.argv.find((a) => a.startsWith('--code='))?.split('=')[1];
  const codes = codeArg ? codeArg.split(',') : COMPETITIONS.map((c) => c.code);

  try {
    const result = await withCronRun(sqlClient, 'sync_fixtures', () =>
      runSyncFixtures(sqlClient, codes),
    );
    console.log(`\nรวม sync ${result.processed} แมตช์จาก ${codes.length} ลีก`);
  } finally {
    await sqlClient.end();
  }
}

main().catch((err) => {
  console.error('Sync ล้มเหลว:', err);
  process.exit(1);
});
