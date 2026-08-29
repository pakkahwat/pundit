import { timingSafeEqual } from 'node:crypto';
import { NextResponse, after } from 'next/server';

import { sqlClient } from '@/db/client';
import { runAiPredictions } from '@/lib/jobs/ai-predictions';
import { runGenerateArticle } from '@/lib/jobs/article';
import { runNotify } from '@/lib/jobs/notify';
import { withCronRun } from '@/lib/jobs/cron-run';
import { runScorePredictions } from '@/lib/jobs/score';
import { runSyncResults } from '@/lib/jobs/sync-results';

// route นี้คือสิ่งที่มาแทนการนั่งพิมพ์ npm run db:* เองบน production — cron-job.org ยิงเข้ามา
// ตามเวลาที่ตั้งไว้ พร้อม header Authorization: Bearer <CRON_SECRET>
//
// ต้องเป็น dynamic เสมอ ห้ามให้ Next cache — ไม่งั้นการยิงครั้งที่สองอาจได้ผลลัพธ์เก่าคืนมา
// โดยที่งานไม่ได้รันจริง
export const dynamic = 'force-dynamic';

// เพดานเวลาของ serverless function (Vercel Hobby สูงสุด 60 วินาที) งาน AI ที่ทายไม่ครบในรอบเดียว
// จะหยุดเองแล้วให้รอบถัดไปทำต่อ (ดูคอมเมนต์ deadlineMs ใน jobs/ai-predictions.ts)
export const maxDuration = 60;

const JOB_TIMEOUT_MS = 55_000;

// งานที่ต้องตอบกลับทันทีแล้วไปทำต่อเบื้องหลัง (ผ่าน after ของ Next) แทนการให้ HTTP รอจนจบ
//
// ที่มา: cron-job.org รอคำตอบได้สูงสุดราว 30 วิ แต่งาน AI ตั้งใจใช้เวลาถึง 55 วิ (LLM call เดียว
// ก็กินได้ 10-20 วิ) — ถ้าให้รอแบบเดิม ฝั่ง cron จะรายงาน "Failed (timeout)" ทุกรอบที่มีงานเยอะ
// ทั้งที่งานสำเร็จ และที่อันตรายจริงคือ cron-job.org ปิด job อัตโนมัติเมื่อ fail ติดกันหลายครั้ง
// = AI หยุดทายทั้งระบบแบบเงียบสนิท
//
// after() ให้ function ทำงานต่อหลังส่ง response ได้จนถึง maxDuration เดิม (60 วิ) — งบเวลา
// ของงานจึงไม่เสียไปแม้แต่วินาทีเดียว ข้อแลกเปลี่ยน: cron-job.org จะเห็น 200 เสมอแม้งานพังกลางทาง
// ผลจริงต้องดูจากตาราง cron_runs (ซึ่ง withCronRun บันทึกให้ครบทั้งสำเร็จและพังอยู่แล้ว)
// ยอมแลกเพราะ "การแจ้งเตือนผิด ๆ จนโดนปิด job" อันตรายกว่า "ไม่ได้อีเมลแจ้งเตือนตอนพัง"
const BACKGROUND_JOBS = new Set<JobName>(['ai-predictions']);

// เทียบ secret แบบ timing-safe — การเทียบสตริงด้วย === จะหยุดทันทีที่เจอตัวอักษรต่างกัน ทำให้
// เวลาที่ใช้บอกใบ้ได้ว่าเดาถูกไปกี่ตัว ซึ่งพอจะใช้ค่อย ๆ เดา secret ทีละตัวได้จริง
function isAuthorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const provided = header?.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // timingSafeEqual โยน error ถ้าความยาวไม่เท่ากัน เลยต้องเช็คก่อน (ความยาวรั่วได้อยู่แล้ว
  // จากขนาด request จึงไม่ใช่ข้อมูลที่ต้องปิด)
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const JOBS = {
  'sync-results': () =>
    withCronRun(sqlClient, 'sync_results', () =>
      // จำกัดช่วงวันที่ ±10 วัน กัน timeout บน Vercel (ดูคอมเมนต์ใน jobs/sync-results.ts) —
      // พอสำหรับ cron ที่รันทุก 30 นาที เพราะโปรแกรมแข่งทั้งฤดูกาล sync ไว้แล้วตอน db:sync-fixtures
      runSyncResults(sqlClient, console.log, { windowDays: 10 }),
    ),
  score: () => withCronRun(sqlClient, 'score_predictions', () => runScorePredictions(sqlClient)),
  'ai-predictions': () =>
    withCronRun(sqlClient, 'run_ai_predictions', () =>
      runAiPredictions(sqlClient, { deadlineMs: JOB_TIMEOUT_MS }),
    ),
  article: () =>
    withCronRun(sqlClient, 'generate_article', () => runGenerateArticle(sqlClient)),
  notify: () => withCronRun(sqlClient, 'notify', () => runNotify(sqlClient)),
} as const;

type JobName = keyof typeof JOBS;

export async function POST(request: Request, ctx: RouteContext<'/api/cron/[job]'>) {
  if (!isAuthorized(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { job } = await ctx.params;
  if (!(job in JOBS)) {
    return NextResponse.json(
      { error: 'unknown job', available: Object.keys(JOBS) },
      { status: 404 },
    );
  }

  if (BACKGROUND_JOBS.has(job as JobName)) {
    after(async () => {
      try {
        await JOBS[job as JobName]();
      } catch (err) {
        // withCronRun บันทึกลง cron_runs ให้แล้ว — log ซ้ำไว้ให้เห็นใน Vercel logs อีกทาง
        console.error(`cron job ${job} (background) ล้มเหลว:`, err);
      }
    });
    return NextResponse.json({ ok: true, job, started: true });
  }

  try {
    const result = await JOBS[job as JobName]();
    return NextResponse.json({ ok: true, job, ...result });
  } catch (err) {
    // ตอบ 500 ให้ cron-job.org เห็นว่าล้มเหลว (มันจะแจ้งเตือนทางอีเมลให้ได้) รายละเอียดเต็ม
    // ถูกบันทึกไว้ใน cron_runs อยู่แล้วผ่าน withCronRun
    console.error(`cron job ${job} ล้มเหลว:`, err);
    return NextResponse.json({ ok: false, job, error: String(err) }, { status: 500 });
  }
}

// รองรับ GET ด้วยเพราะ scheduler บางเจ้าตั้งค่าให้ยิง GET ง่ายกว่า — ยังต้องมี secret เหมือนกัน
export const GET = POST;
