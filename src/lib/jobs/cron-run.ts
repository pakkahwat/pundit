import type postgres from 'postgres';

// ห่อทุกงาน cron ด้วยการบันทึกลง cron_runs — สำคัญมากบน production เพราะงานพวกนี้รันตอนไม่มีใคร
// ดูอยู่ ถ้าไม่บันทึกไว้จะไม่มีทางรู้เลยว่ามันรันจริงไหม สำเร็จหรือพัง เพราะอะไร
// (โดยเฉพาะงานที่พลาดแล้วเสียหายถาวร เช่นให้ AI ทายก่อนคิกออฟ)
export async function withCronRun<T extends { processed: number }>(
  sql: postgres.Sql,
  jobName: string,
  fn: () => Promise<T>,
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
    return result;
  } catch (err) {
    await sql`
      update cron_runs set status = 'error', error = ${String(err)}, finished_at = now()
      where id = ${id}
    `;
    throw err;
  }
}
