import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// คิดคะแนน — ตรรกะจริงอยู่ใน src/lib/jobs/score.ts ชุดเดียวกับที่ route /api/cron/score ใช้
// รัน: npm run db:score

async function main() {
  const { sqlClient } = await import('../src/db/client');
  const { runScorePredictions } = await import('../src/lib/jobs/score');
  const { withCronRun } = await import('../src/lib/jobs/cron-run');

  try {
    const result = await withCronRun(sqlClient, 'score_predictions', () =>
      runScorePredictions(sqlClient),
    );
    console.log(`คิดคะแนนใหม่/เปลี่ยน ${result.processed} รายการ`);
  } finally {
    await sqlClient.end();
  }
}

main().catch((err) => {
  console.error('คิดคะแนนล้มเหลว:', err);
  process.exit(1);
});
