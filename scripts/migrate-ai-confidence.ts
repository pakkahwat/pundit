import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

// เพิ่มคอลัมน์ความน่าจะเป็น (%) ของแต่ละผลที่ AI ประเมินไว้ตอนทาย — ใช้วัด calibration
// (ดู src/lib/ai/probabilities.ts) แถวเก่าเป็น null ซึ่งหน้าเว็บจัดการได้อยู่แล้ว
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL ใน .env.local");

  const sql = postgres(connectionString, { prepare: false });
  try {
    await sql`
      alter table ai_prediction_logs
      add column if not exists prob_home smallint,
      add column if not exists prob_draw smallint,
      add column if not exists prob_away smallint
    `;
    console.log("เพิ่มคอลัมน์ ai_prediction_logs.prob_home/prob_draw/prob_away สำเร็จ");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migrate AI confidence ล้มเหลว:", err);
  process.exit(1);
});
