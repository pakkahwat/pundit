import type postgres from 'postgres';

import { reportOps } from '@/lib/notify/ops';

// ห่อทุกงาน cron ด้วยการบันทึกลง cron_runs — สำคัญมากบน production เพราะงานพวกนี้รันตอนไม่มีใคร
// ดูอยู่ ถ้าไม่บันทึกไว้จะไม่มีทางรู้เลยว่ามันรันจริงไหม สำเร็จหรือพัง เพราะอะไร
// (โดยเฉพาะงานที่พลาดแล้วเสียหายถาวร เช่นให้ AI ทายก่อนคิกออฟ)
//
// นอกจากบันทึกแล้วยังรายงานเข้าช่อง ops (ดู lib/notify/ops.ts) ตอนงาน "เริ่มพัง" และ "กลับมาปกติ"
// และถือโอกาสทุกครั้งที่มีงานไหนก็ได้รันสำเร็จ เช็คว่างานสำคัญตัวอื่นเงียบไปนานผิดปกติไหม —
// เพราะ cron-job.org ปิด job ที่ล้มติดกันหลายครั้งอัตโนมัติ ซึ่งงานที่โดนปิดจะไม่มีวันรายงานตัวเอง
// ได้อีก ต้องอาศัยเพื่อนร่วมงานที่ยังรันอยู่เป็นคนฟ้อง (ถ้าโดนปิดทั้งหมดพร้อมกันก็หมดทาง —
// นั่นต้องใช้ uptime monitor จากข้างนอก)
const STALE_AFTER_MS: Record<string, number> = {
  sync_results: 3 * 60 * 60 * 1000, // ตั้งไว้ทุก 30 นาที — 3 ชม. = พลาดไป 6 รอบ
  run_ai_predictions: 2 * 60 * 60 * 1000, // ตั้งไว้ทุก 15 นาที
};

// ห้ามโยน error ออกไป — ตัวนี้ถูกเรียกหลังงานหลักสำเร็จแล้ว ถ้า select นี้สะดุด (DB กระตุก) แล้วหลุด
// ไปถึง catch ของ withCronRun งานที่สำเร็จจริงจะถูกบันทึกเป็น 'error' และส่งแจ้งเตือนผิด ๆ
async function checkStaleJobs(sql: postgres.Sql, log: (msg: string) => void) {
  try {
    const rows = await sql<{ job_name: string; last_ok_epoch: number }[]>`
      select job_name, extract(epoch from max(finished_at))::float8 as last_ok_epoch
      from cron_runs
      where status = 'success'
      group by job_name
    `;
    for (const [job, maxAge] of Object.entries(STALE_AFTER_MS)) {
      const last = rows.find((r) => r.job_name === job)?.last_ok_epoch;
      // ไม่เคยรันสำเร็จเลย = ยังไม่ได้ตั้ง cron ไม่ใช่ "ค้าง" — ไม่ต้องโวย
      if (!last) continue;
      const ageMs = Date.now() - last * 1000;
      const stale = ageMs > maxAge;
      await reportOps(
        sql,
        `stale:${job}`,
        stale ? 'stale' : 'ok',
        stale ? `รันสำเร็จล่าสุดเมื่อ ${Math.round(ageMs / 3_600_000)} ชม.ก่อน — cron-job.org อาจปิด job นี้ไปแล้ว` : null,
        log,
      );
    }
  } catch (err) {
    log(`[ops] เช็คงานค้างไม่สำเร็จ: ${String(err)}`);
  }
}

export async function withCronRun<T extends { processed: number }>(
  sql: postgres.Sql,
  jobName: string,
  fn: () => Promise<T>,
  log: (msg: string) => void = console.log,
): Promise<T> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into cron_runs (job_name, status) values (${jobName}, 'running') returning id
  `;

  try {
    const result = await fn();
    await sql`
      update cron_runs set status = 'success', processed_count = ${result.processed}, finished_at = now()
      where id = ${id}
    `;
    await reportOps(sql, `cron:${jobName}`, 'ok', null, log);
    await checkStaleJobs(sql, log);
    return result;
  } catch (err) {
    await sql`
      update cron_runs set status = 'error', error = ${String(err)}, finished_at = now()
      where id = ${id}
    `;
    await reportOps(sql, `cron:${jobName}`, 'error', String(err), log);
    throw err;
  }
}
