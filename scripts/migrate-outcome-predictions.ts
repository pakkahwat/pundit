import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// migration: เปลี่ยนจาก "ทายสกอร์" เป็น "ทายผลแพ้/ชนะ/เสมอ" อย่างเดียว (ไม่มีการทายสกอร์อีกต่อไป)
// เขียนเป็น ALTER แทน db:reset เพื่อไม่ให้ลีก/สมาชิก/คำทายที่เทสไว้หายไป — คำทายเดิมจะถูกแปลงเป็น
// outcome ให้อัตโนมัติจากสกอร์ที่เคยทายไว้ ส่วนคะแนนเก่าที่คิดด้วยกติกาเดิมจะถูกลบเพื่อคิดใหม่
//
// idempotent เต็มรูปแบบ: รันซ้ำได้ และรันผ่านได้ไม่ว่า DB จะอยู่สถานะไหน (ยังเป็น schema เดิม
// ทั้งหมด หรือรัน migration เวอร์ชันก่อนหน้า (ที่ยังมีสกอร์ optional) ไปแล้วก็ตาม)
// รัน: npm run db:migrate-outcome

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL ใน .env.local');
  }
  const sql = postgres(connectionString, { prepare: false });

  try {
    await sql.begin(async (tx) => {
      console.log('1/5 สร้าง enum prediction_outcome...');
      await tx`
        do $$ begin
          create type prediction_outcome as enum ('HOME','DRAW','AWAY');
        exception when duplicate_object then null;
        end $$
      `;

      console.log('2/5 เพิ่มคอลัมน์ predicted_outcome...');
      await tx`
        alter table predictions add column if not exists predicted_outcome prediction_outcome
      `;

      console.log('3/5 แปลงคำทายเดิม (สกอร์) เป็นผลแพ้/ชนะ/เสมอ...');
      // ห่อด้วย DO block ที่เช็คว่าคอลัมน์สกอร์ยังอยู่ไหม — เผื่อกรณีรัน migration นี้ซ้ำหลังจาก
      // คอลัมน์ถูก drop ไปแล้วในรอบก่อน (ไม่งั้น UPDATE จะพังเพราะอ้างคอลัมน์ที่ไม่มี)
      await tx`
        do $$ begin
          if exists (
            select 1 from information_schema.columns
            where table_name = 'predictions' and column_name = 'predicted_home_score'
          ) then
            update predictions set predicted_outcome = case
              when predicted_home_score > predicted_away_score then 'HOME'::prediction_outcome
              when predicted_home_score < predicted_away_score then 'AWAY'::prediction_outcome
              else 'DRAW'::prediction_outcome
            end
            where predicted_outcome is null;
          end if;
        end $$
      `;
      // เผื่อมีแถวที่ยังว่างอยู่ (เช่นคอลัมน์สกอร์ถูก drop ไปแล้วแต่มีแถวใหม่ที่ outcome ว่าง)
      // — ไม่ควรเกิดขึ้นจริง แต่กันไว้ให้ SET NOT NULL ข้างล่างผ่านแน่นอน
      await tx`delete from predictions where predicted_outcome is null`;
      await tx`alter table predictions alter column predicted_outcome set not null`;

      console.log('4/5 ลบคอลัมน์สกอร์ทิ้ง (ไม่ใช้แล้ว)...');
      // constraint ที่อ้างคอลัมน์เหล่านี้จะถูกลบไปเองพร้อมคอลัมน์
      await tx`alter table predictions drop column if exists predicted_home_score`;
      await tx`alter table predictions drop column if exists predicted_away_score`;

      console.log('5/5 อัปเดต scoring_config + ลบคะแนนเก่าที่คิดด้วยกติกาเดิม...');
      await tx`
        alter table leagues alter column scoring_config
          set default '{"correct":3,"wrong":0}'::jsonb
      `;
      // อัปเดตเฉพาะลีกที่ยังใช้ config รูปแบบเก่าอยู่ (ยังไม่มี key 'correct')
      await tx`
        update leagues set scoring_config = '{"correct":3,"wrong":0}'::jsonb
        where not (scoring_config ? 'correct')
      `;
      const deleted = await tx`delete from prediction_scores returning id`;
      console.log(`   ลบคะแนนเก่าไป ${deleted.length} แถว`);
    });

    console.log('\nmigration เสร็จแล้ว — ต่อไปรัน: npm run db:score');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Migration ล้มเหลว:', err);
  process.exit(1);
});
