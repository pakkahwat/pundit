import './lib/prefer-ipv4'; // ต้องมาก่อน import อื่นที่ใช้เน็ต (ดูเหตุผลในไฟล์นั้น)

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// เขียนบทความประจำวัน — ตรรกะจริงอยู่ใน src/lib/jobs/article.ts ชุดเดียวกับที่ route
// /api/cron/article ใช้
//
// ใช้งาน:
//   npm run db:generate-article                    เขียนของวันนี้
//   npm run db:generate-article -- --force         เขียนทับของวันนี้ที่มีอยู่แล้ว
//   npm run db:generate-article -- --date=2026-08-20   เขียนย้อนหลังของวันที่ระบุ
//   npm run db:generate-article -- --days=6        เขียนย้อนหลัง 6 วัน (วันนี้ + 5 วันก่อนหน้า)
//
// --days มีไว้สำหรับสร้างข้อมูลทดสอบให้พอเห็น pagination เท่านั้น ไม่ได้ตั้งใจให้ใช้จริง
// (เนื้อหาจะคล้ายกันมาก เพราะข้อมูลต้นทางใน DB เป็นชุดเดียวกัน ต่างแค่วันที่)

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split('=')[1];
}

// ถอยหลังจากวันนี้ (เวลาไทย) ทีละวัน คืนเป็น YYYY-MM-DD
function bangkokDateOffset(daysAgo: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - daysAgo);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

async function main() {
  const { sqlClient } = await import('../src/db/client');
  const { runGenerateArticle } = await import('../src/lib/jobs/article');
  const { withCronRun } = await import('../src/lib/jobs/cron-run');

  const force = process.argv.includes('--force');
  const explicitDate = argValue('date');
  const days = Number(argValue('days') ?? 1);

  if (!Number.isInteger(days) || days < 1 || days > 30) {
    console.error('--days ต้องเป็นจำนวนเต็ม 1-30');
    process.exit(1);
  }

  const dates = explicitDate
    ? [explicitDate]
    : Array.from({ length: days }, (_, i) => bangkokDateOffset(i));

  try {
    for (const date of dates) {
      const result = await withCronRun(sqlClient, 'generate_article', () =>
        runGenerateArticle(sqlClient, {
          force,
          date,
          onLog: (m) => console.log(`[${date}] ${m}`),
        }),
      );
      // สรุปเป็นรายลีก เพราะตอนนี้เขียนลีกละหนึ่งบทต่อวัน ไม่ใช่บทเดียวทั้งระบบ
      console.log(
        `[${date}] เขียนใหม่ ${result.processed} · ข้าม ${result.skipped} · ล้มเหลว ${result.failed}`,
      );
      for (const title of result.titles) console.log(`         "${title}"`);
      if (result.skipped > 0 && result.processed === 0) {
        console.log(`         ใช้ --force ถ้าต้องการเขียนทับของเดิม`);
      }
    }
  } finally {
    await sqlClient.end();
  }
}

main().catch((err) => {
  console.error('เขียนบทความล้มเหลว:', err);
  process.exit(1);
});
