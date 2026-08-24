import { sql } from 'drizzle-orm';

import { db } from './client';

// export ไว้ให้โค้ดอื่นที่ต้องรับ tx เป็นพารามิเตอร์ใช้ type นี้ได้ (เช่น
// src/lib/predictions/guarded-upsert.ts) — เป็น type-only import เลยไม่กระทบ runtime/env timing
// ของ script ที่ import แค่ type จากไฟล์นี้ (ไม่ได้รัน db.transaction ของ client.ts จริง ๆ)
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ตาราง predictions มี RLS policy ที่อ้างอิง current_setting('app.current_user_id') ทุก query
// ที่แตะตารางนี้ (ทั้งอ่านและเขียน) ต้องรันผ่านฟังก์ชันนี้ ไม่งั้น Postgres จะมองว่าไม่มี user
// context เลย แล้วปฏิเสธหมด (insert/update โดน reject, select เห็นแค่แมตช์ที่ล็อกแล้วเท่านั้น
// แม้แต่ของตัวเอง) — set_config(..., true) ตัวสุดท้ายคือ is_local แปลว่าค่านี้จะหายไปเองตอน
// transaction จบ ไม่ค้างข้าม request แม้จะใช้ connection pool ร่วมกัน
export async function withUserContext<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
    return fn(tx);
  });
}
