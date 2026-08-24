import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env.local' });

// เวิร์กโฟลว์ของโปรเจกต์นี้: src/db/schema.sql คือ source of truth ที่เขียน/รีวิวด้วยมือ
// เวลาจะแก้ schema ให้แก้ที่ schema.sql ก่อน apply เข้า DB ตรง ๆ (psql หรือสคริปต์)
// แล้วรัน `npm run db:pull` เพื่อ introspect กลับมาเป็น src/db/schema.ts (ไฟล์นี้ auto-generate
// ห้ามแก้มือ) ที่ Drizzle ใช้ตอน query จริงในแอป — เก็บ SQL เป็นของจริงหนึ่งเดียว ไม่ให้สองไฟล์เพี้ยนกัน
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
