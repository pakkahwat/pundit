import type postgres from 'postgres';

// ตัวห่อ fetch ที่แคชผลลัพธ์ลงตาราง api_cache — มีไว้เพราะ football-data.org แผนฟรีจำกัด
// 10 requests/นาที (requirement ข้อ 6) ถ้าปล่อยให้ทุกคนที่เปิดหน้าเว็บยิง API ตรง ๆ แค่มีคน
// เปิดพร้อมกันสิบกว่าคนก็ตันแล้ว และตารางคะแนนไม่ได้เปลี่ยนทุกวินาทีอยู่แล้ว
//
// ถ้า API ล่มหรือโดน rate limit จะ fallback ไปใช้ข้อมูลเก่าที่หมดอายุแล้วแทนการโยน error —
// ตารางคะแนนเก่าครึ่งชั่วโมงยังมีประโยชน์กว่าหน้าจอ error เปล่า ๆ
export async function cachedFetchJson<T>(
  sql: postgres.Sql,
  cacheKey: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<{ data: T; stale: boolean; fetchedAt: Date }> {
  const [fresh] = await sql<{ payload: T; fetched_at: Date }[]>`
    select payload, fetched_at from api_cache
    where cache_key = ${cacheKey} and expires_at > now()
  `;
  if (fresh) {
    return { data: fresh.payload, stale: false, fetchedAt: fresh.fetched_at };
  }

  try {
    const data = await fetcher();
    await sql`
      insert into api_cache (cache_key, payload, fetched_at, expires_at)
      values (
        ${cacheKey}, ${JSON.stringify(data)}::jsonb, now(),
        now() + make_interval(secs => ${ttlSeconds})
      )
      on conflict (cache_key) do update set
        payload = excluded.payload,
        fetched_at = now(),
        expires_at = excluded.expires_at
    `;
    return { data, stale: false, fetchedAt: new Date() };
  } catch (err) {
    const [stale] = await sql<{ payload: T; fetched_at: Date }[]>`
      select payload, fetched_at from api_cache where cache_key = ${cacheKey}
    `;
    if (stale) {
      console.error(`ดึง ${cacheKey} ไม่สำเร็จ ใช้ข้อมูลเก่าที่แคชไว้แทน:`, err);
      return { data: stale.payload, stale: true, fetchedAt: stale.fetched_at };
    }
    throw err;
  }
}
