import './lib/prefer-ipv4'; // ต้องมาก่อน import อื่นที่ใช้เน็ต (ดูเหตุผลในไฟล์นั้น)

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// ส่งแจ้งเตือนเข้า Discord ของทุกลีกที่ตั้ง webhook ไว้ — ตรรกะเดียวกับที่ /api/cron/notify ใช้
// รัน: npm run db:notify
async function main() {
  const { sqlClient } = await import('../src/db/client');
  const { runNotify } = await import('../src/lib/jobs/notify');

  try {
    const result = await runNotify(sqlClient);
    console.log(
      `\nส่งไป ${result.processed} ข้อความ (ล้มเหลว ${result.failed}) จาก ${result.leagues} ลีกที่เปิดแจ้งเตือน`,
    );
  } finally {
    await sqlClient.end();
  }
}

main().catch((err) => {
  console.error('Notify ล้มเหลว:', err);
  process.exit(1);
});
