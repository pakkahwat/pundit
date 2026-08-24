import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// ล้าง schema public ทั้งหมดแล้ว apply src/db/schema.sql ใหม่ตั้งแต่ต้น
// ใช้ได้เฉพาะช่วง dev ที่ยัง iterate โครงสร้างอยู่และ DB ยังไม่มีข้อมูลจริง — มีข้อมูลจริงแล้วห้ามรัน
// ใช้: npm run db:reset
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL ใน .env.local');
  }

  const sql = postgres(connectionString, { prepare: false });

  console.log('Dropping schema public...');
  await sql`drop schema public cascade`;
  await sql`create schema public`;

  const schemaPath = path.resolve(__dirname, '../src/db/schema.sql');
  console.log(`Applying ${schemaPath} ...`);
  await sql.file(schemaPath);
  console.log('Reset + apply schema สำเร็จ');

  await sql.end();
}

main().catch((err) => {
  console.error('Reset schema ล้มเหลว:', err);
  process.exit(1);
});
