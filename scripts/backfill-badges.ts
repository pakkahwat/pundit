import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

import { awardBadgesForUsers } from "@/lib/stats/profile";

config({ path: path.resolve(__dirname, "../.env.local") });

// แจกเหรียญ + อัปเดตสตรีคสูงสุดย้อนหลังให้ทุกคนที่เคยทาย (รวมผู้เล่น AI) ในรอบเดียว
//
// ใช้เครื่องประเมินตัวเดียวกับที่ score cron ใช้ (awardBadgesForUsers) ไม่ได้เขียนตรรกะซ้ำ —
// จึงรันซ้ำได้ปลอดภัยเสมอ: เหรียญที่ได้แล้ว insert แบบไม่ทับ (วันที่ได้ครั้งแรกคงเดิม)
// สตรีคเขียนทับด้วย greatest จึงมีแต่เพิ่มขึ้น
//
// ปกติรันครั้งเดียวหลัง migrate: หลังจากนั้น cron score แจกต่อให้เองทุกรอบ
//   $env:DATABASE_URL="<prod pooled connection string>"   # ถ้าจะยิง prod
//   npm run db:backfill-badges

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL ใน .env.local");

  const sql = postgres(connectionString, { prepare: false });
  try {
    const users = await sql<{ id: string; name: string | null }[]>`
      select distinct u.id, coalesce(u.display_name, u.name) as name
      from users u
      join predictions p on p.user_id = u.id
      order by name
    `;
    console.log(`ผู้ทายทั้งหมด ${users.length} คน — เริ่มประเมิน`);

    for (const user of users) {
      await awardBadgesForUsers(sql, [user.id]);
      const [row] = await sql<{ badges: number; best_streak: number }[]>`
        select
          (select count(*)::int from user_badges where user_id = ${user.id}) as badges,
          (select best_streak from users where id = ${user.id}) as best_streak
      `;
      console.log(
        `  ${user.name ?? user.id}: ${row.badges} เหรียญ · สตรีคสูงสุด ${row.best_streak}`,
      );
    }

    console.log("เสร็จแล้ว — จากนี้ score cron แจกต่อให้เองทุกรอบ");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Backfill เหรียญล้มเหลว:", err);
  process.exit(1);
});
