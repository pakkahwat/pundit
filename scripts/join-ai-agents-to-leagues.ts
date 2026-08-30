import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// จัดสมาชิกภาพของผู้เล่น AI ในทุกลีกให้ตรงกับสถานะจริง — สองทิศทางในคำสั่งเดียว:
//   1. ตัว active ที่ยังไม่อยู่ลีกไหน → พาเข้าเป็นสมาชิก (ลีกสร้างใหม่มี auto-join อยู่แล้ว
//      ใน src/app/leagues/new/actions.ts ตัวนี้เก็บเฉพาะลีกเก่า)
//   2. ตัวที่ถูกปลดประจำการ (is_active = false) → กวาดออกจากทุกลีก ไม่ให้ค้างเป็นซากบน
//      ตารางอันดับ/รายชื่อสมาชิก — คำทายกับคะแนนที่เคยทำไว้ "ไม่ถูกลบ" (prediction_scores
//      ไม่ผูกกับ league_members) จึงยังใช้วิเคราะห์ย้อนหลังได้ครบ แค่หายจากหน้าลีกเท่านั้น
// idempotent ทั้งคู่ — รันซ้ำกี่รอบผลเท่าเดิม
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

    const evicted = await sql<{ league_id: string; user_id: string }[]>`
      delete from league_members lm
      using ai_agents a
      where a.user_id = lm.user_id and a.is_active = false
      returning lm.league_id, lm.user_id
    `;
    console.log(`กวาด AI ที่ปลดประจำการออกจากลีก ${evicted.length} รายการ`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Backfill ล้มเหลว:', err);
  process.exit(1);
});
