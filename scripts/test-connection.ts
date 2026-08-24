import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// ทดสอบว่าต่อ Neon ติดจริง + schema ถูก apply แล้ว
// ใช้: npm run db:test
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL ใน .env.local');
  }

  const sql = postgres(connectionString, { prepare: false });

  const [{ now }] = await sql<{ now: string }[]>`select now()`;
  console.log('เชื่อมต่อ Neon สำเร็จ, เวลา server:', now);

  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `;
  console.log(`เจอ ${tables.length} ตารางใน public schema:`);
  for (const t of tables) console.log(' -', t.table_name);

  await sql.end();
}

main().catch((err) => {
  console.error('ต่อ DB ไม่สำเร็จ:', err);
  process.exit(1);
});
