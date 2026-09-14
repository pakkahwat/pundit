import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

// ตารางจำสถานะล่าสุดของแต่ละเรื่องที่ระบบเฝ้าดู (ดู src/lib/notify/ops.ts) — ใช้ส่ง Discord
// เฉพาะตอนสถานะเปลี่ยน ไม่ต้องรันก่อนก็ได้: โค้ดกลืน error แล้ว log แทน แต่จะไม่มีการแจ้งเตือนจนกว่า
// จะรันสคริปต์นี้
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL ใน .env.local");

  const sql = postgres(connectionString, { prepare: false });
  try {
    await sql`
      create table if not exists ops_alerts (
        key text primary key,
        state text not null,
        detail text,
        updated_at timestamptz not null default now()
      )
    `;
    console.log("สร้างตาราง ops_alerts สำเร็จ");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migrate ops alerts ล้มเหลว:", err);
  process.exit(1);
});
