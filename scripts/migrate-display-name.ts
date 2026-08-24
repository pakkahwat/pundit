import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// migration: เพิ่มคอลัมน์ users.display_name (ชื่อที่ผู้ใช้ตั้งเองสำหรับแสดงในลีก)
// แยกจาก users.name ที่ Auth.js เขียนจากบัญชี Google เพื่อไม่ให้ถูกเขียนทับตอน login ครั้งถัดไป
// รันซ้ำได้ปลอดภัย (IF NOT EXISTS) และไม่แตะข้อมูลเดิม
// รัน: npm run db:migrate-display-name

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL ใน .env.local');
  }
  const sql = postgres(connectionString, { prepare: false });

  try {
    await sql`alter table users add column if not exists display_name text`;
    console.log('เพิ่มคอลัมน์ users.display_name เรียบร้อย');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Migration ล้มเหลว:', err);
  process.exit(1);
});
