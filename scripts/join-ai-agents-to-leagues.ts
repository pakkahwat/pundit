import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// backfill: เพิ่ม AI agent ที่ active ทุกตัวเข้าไปเป็นสมาชิกของลีกที่มีอยู่แล้วทั้งหมด (ลีกที่สร้าง
// ก่อนจะมี AI agent ในระบบ) — ลีกที่สร้างใหม่หลังจากนี้ไม่ต้องรันตัวนี้ เพราะ
// src/app/leagues/new/actions.ts เพิ่ม AI agent ให้อัตโนมัติตั้งแต่ตอนสร้างลีกอยู่แล้ว
// idempotent ผ่าน ON CONFLICT DO NOTHING (unique (league_id, user_id) ใน league_members)
// รันมือ: npx tsx scripts/join-ai-agents-to-leagues.ts

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL ใน .env.local');
  }
  const sql = postgres(connectionString, { prepare: false });

  try {
    const result = await sql`
      insert into league_members (league_id, user_id, role)
      select l.id, a.user_id, 'member'
      from leagues l
      cross join (select user_id from ai_agents where is_active = true) a
      on conflict (league_id, user_id) do nothing
      returning league_id, user_id
    `;
    console.log(`เพิ่ม AI agent เข้าลีกไปทั้งหมด ${result.length} รายการ (ที่ยังไม่เป็นสมาชิกอยู่ก่อน)`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Backfill ล้มเหลว:', err);
  process.exit(1);
});
