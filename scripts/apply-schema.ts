import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// รัน src/db/schema.sql เข้ากับ Neon ตรง ๆ (source of truth คือไฟล์ .sql ไม่ใช่ TS)
// ใช้: npm run db:apply-schema
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL ใน .env.local');
  }

  const sql = postgres(connectionString, { prepare: false });
  const schemaPath = path.resolve(__dirname, '../src/db/schema.sql');

  console.log(`Applying ${schemaPath} ...`);
  await sql.file(schemaPath);
  console.log('Schema applied สำเร็จ');

  await sql.end();
}

main().catch((err) => {
  console.error('Apply schema ล้มเหลว:', err);
  process.exit(1);
});
