import './lib/prefer-ipv4'; // ต้องมาก่อน import อื่นที่ใช้เน็ต (ดูเหตุผลในไฟล์นั้น)

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// ให้ AI ทายผล — ตรรกะจริงอยู่ใน src/lib/jobs/ai-predictions.ts ชุดเดียวกับที่ route
// /api/cron/ai-predictions ใช้ ต่างกันแค่ตรงนี้ไม่มี deadline (รันบนเครื่องตัวเองได้นานเท่าไรก็ได้)
// รัน: npm run db:run-ai-predictions

async function main() {
  const { sqlClient } = await import('../src/db/client');
  const { runAiPredictions } = await import('../src/lib/jobs/ai-predictions');
  const { withCronRun } = await import('../src/lib/jobs/cron-run');

  try {
    const result = await withCronRun(sqlClient, 'run_ai_predictions', () =>
      runAiPredictions(sqlClient, { onLog: (m) => console.log(m) }),
    );
    console.log(`เสร็จ: สำเร็จ ${result.processed} รายการ, ล้มเหลว ${result.failed} รายการ`);
  } finally {
    await sqlClient.end();
  }
}

main().catch((err) => {
  console.error('AI ทายผลล้มเหลว:', err);
  process.exit(1);
});
