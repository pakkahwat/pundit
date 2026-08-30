import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

import { awardBadgesForUsers } from "@/lib/stats/profile";

config({ path: path.resolve(__dirname, "../.env.local") });

// ล้าง "แต้มผี" ครั้งเดียว + คำนวณสตรีค/เหรียญใหม่จากศูนย์ด้วยข้อมูลสะอาด
//
// ที่มา: football-data เคยส่งสถานะจบ+สกอร์มา แล้วภายหลังกลับคำเป็น TIMED ไม่มีสกอร์
// (นัดยังไม่เตะจริง) — job คิดคะแนนมองเฉพาะนัด FINISHED จึงไม่เคยตามไปลบแต้มที่ตัดค้างไว้
// ผลคือแต้มรวมเกินจริง และสตรีคสูงสุด/เหรียญบางใบได้มาจากนัดผี
//
// ต่างจาก backfill-badges ตรงที่สคริปต์นี้ "รื้อแล้วสร้างใหม่": ล้าง best_streak เป็น 0 และ
// ลบเหรียญทั้งหมดก่อน แล้วให้เครื่องประเมินตัวเดิม (awardBadgesForUsers) แจกใหม่จากข้อมูลจริง
// — greatest() ของมันจะไม่มีวันลดค่าที่ปนเปื้อนลงเอง จึงต้องรีเซ็ตก่อน (วันที่ได้เหรียญถูก
// รีเซ็ตเป็นวันรันสคริปต์ ยอมแลกกับความถูกต้อง) ส่วน score cron รอบถัด ๆ ไปมีตัวเก็บกวาด
// แบบเดียวกันในตัวแล้ว (ดู src/lib/jobs/score.ts) สคริปต์นี้จึงใช้แค่ครั้งเดียว
//
//   DATABASE_URL=... npx tsx scripts/cleanup-stale-scores.ts

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");
  console.log(`target: ${new URL(connectionString).host}`);
  const sql = postgres(connectionString, { max: 1 });
  try {
    const stale = await sql<{ prediction_id: string }[]>`
      delete from prediction_scores ps
      using predictions p, matches m
      where p.id = ps.prediction_id
        and m.id = p.match_id
        and (m.status <> 'FINISHED' or m.home_score is null or m.away_score is null)
        and m.kickoff_at > now()
      returning ps.prediction_id
    `;
    console.log(`ลบแต้มผีแล้ว ${stale.length} แถว`);

    await sql`update users set best_streak = 0 where best_streak <> 0`;
    await sql`delete from user_badges`;
    const users = await sql<{ user_id: string }[]>`
      select distinct user_id from predictions
    `;
    await awardBadgesForUsers(sql, users.map((u) => u.user_id));
    console.log(`คำนวณสตรีค+เหรียญใหม่ให้ ${users.length} คนเรียบร้อย`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
