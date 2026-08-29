import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

// เพิ่มของฝั่งโปรไฟล์: ตารางเหรียญตรา + คอลัมน์สตรีคสูงสุด — รันซ้ำได้ (if not exists ทั้งคู่)
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL ใน .env.local");

  const sql = postgres(connectionString, { prepare: false });
  try {
    await sql`
      create table if not exists user_badges (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references users(id) on delete cascade,
        badge_key text not null,
        earned_at timestamptz not null default now(),
        unique (user_id, badge_key)
      )
    `;
    await sql`create index if not exists user_badges_user_idx on user_badges (user_id)`;
    await sql`
      alter table users add column if not exists best_streak smallint not null default 0
    `;
    console.log("เพิ่ม user_badges และ users.best_streak สำเร็จ");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migrate profile badges ล้มเหลว:", err);
  process.exit(1);
});
