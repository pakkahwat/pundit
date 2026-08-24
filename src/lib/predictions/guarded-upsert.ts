import { sql } from 'drizzle-orm';

import type { Tx } from '@/db/rls';
import type { PredictionOutcome } from './outcome';

// guard เวลาปิดรับอยู่ใน SQL statement เดียวกับการเขียนตรง ๆ (ใช้ now() ของ Postgres เอง) ไม่ใช่
// เช็คเวลาใน JS ก่อนแล้วค่อยเขียนแยกที — กันทั้ง client ปลอมเวลา และกัน race condition ที่เวลาจะ
// เปลี่ยนระหว่างเช็ค (JS) กับเขียน (SQL) เป็นคนละ statement ครอบทั้ง insert แรกและ update ตอนแก้ไข
// คำทายเดิมด้วย WHERE คนละจุด (ดูคอมเมนต์อ้างอิงใน schema.sql)
//
// ดึงออกมาจาก actions.ts เป็นฟังก์ชันกลางตรงนี้ เพราะทั้งมนุษย์ (ผ่าน Server Action) และ AI (ผ่าน
// scripts/run-ai-predictions.ts) ต้องเขียนคำทายผ่าน "โค้ดเส้นทางเดียวกันเป๊ะ ๆ" ไม่ใช่แค่ SQL
// หน้าตาเหมือนกัน — นี่คือวิธี "structurally" รับประกันว่า AI ไม่มีทางได้ deadline พิเศษไปจาก
// มนุษย์เลย (requirement ข้อ 5) ต้องเรียกภายใน transaction ที่ตั้ง app.current_user_id ไว้แล้ว
// (ดู withUserContext ใน src/db/rls.ts) ไม่งั้น RLS insert/update policy จะ reject ทั้งหมด
export async function guardedUpsertPrediction(
  tx: Tx,
  userId: string,
  matchId: string,
  outcome: PredictionOutcome,
) {
  return tx.execute<{ id: string }>(sql`
    insert into predictions (user_id, match_id, predicted_outcome)
    select ${userId}::uuid, ${matchId}::uuid, ${outcome}::prediction_outcome
    where (select kickoff_at from matches where id = ${matchId}::uuid) > now()
    on conflict (user_id, match_id) do update set
      predicted_outcome = excluded.predicted_outcome,
      updated_at = now()
    where (select kickoff_at from matches where id = predictions.match_id) > now()
    returning id
  `);
}
