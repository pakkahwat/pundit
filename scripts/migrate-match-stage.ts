import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

// เพิ่ม matches.stage (vocabulary ของ football-data: REGULAR_SEASON, LEAGUE_STAGE, PLAYOFFS,
// LAST_16, QUARTER_FINALS, SEMI_FINALS, FINAL, ...) ใช้แสดงชื่อรอบของบอลถ้วยแทนเลขแมตช์เดย์
// (ดู src/lib/matches/stage-label.ts) แถวเก่าเป็น null = แสดง "แมตช์เดย์ N" เหมือนเดิม
// และจะถูกเติมเองในการ sync รอบถัดไป
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL ใน .env.local");

  const sql = postgres(connectionString, { prepare: false });
  try {
    await sql`alter table matches add column if not exists stage text`;
    console.log("เพิ่มคอลัมน์ matches.stage สำเร็จ");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migrate match stage ล้มเหลว:", err);
  process.exit(1);
});
