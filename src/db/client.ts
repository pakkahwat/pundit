import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

// ใช้ connection เดียวสำหรับทั้งแอป — ตอนแรกวางแผนจะแยกเป็น 2 role (pundit_app ที่โดน RLS บังคับ
// กับ pundit_service ที่ BYPASSRLS สำหรับ cron) แต่พอทำจริงพบว่าไม่จำเป็น: RLS select policy
// อนุญาตให้อ่านคำทายของแมตช์ที่ล็อกแล้วโดยไม่ต้องมี user context อยู่แล้ว และงาน cron ก็ไม่เคย
// เขียนลง predictions (เขียนแค่ prediction_scores ซึ่งไม่มี RLS) — ดู src/db/schema.sql
//
// ข้อควรจำตอน deploy: บน Vercel ให้ใช้ connection string แบบ pooled ของ Neon (มี -pooler
// ในชื่อโฮสต์) เพราะ serverless function เปิด connection พร้อมกันได้เยอะมาก
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'Missing DATABASE_URL — copy .env.local.example เป็น .env.local แล้วใส่ connection string จาก Neon',
  );
}

// export ตัว client ดิบด้วย เพราะงาน cron หลายตัวเขียนเป็น raw SQL (aggregate/upsert ซับซ้อน
// ที่อ่านง่ายกว่าเมื่อเขียน SQL ตรง ๆ) และต้องใช้ผ่าน route handler ไม่ใช่แค่ในสคริปต์
export const sqlClient = postgres(connectionString, { prepare: false });

export const db = drizzle(sqlClient, { schema });
