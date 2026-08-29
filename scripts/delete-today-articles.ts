import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

function todayInBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL in .env.local");
  }

  // ลบถาวร แก้กลับไม่ได้ (ต้องให้ AI เขียนใหม่ทั้งหมด) จึงบังคับยืนยันเหมือน db:reset-play
  // รัน: npm run db:delete-today-articles -- --yes   (ไม่ใส่ = แสดงรายการเฉย ๆ ไม่ลบ)
  const confirmed = process.argv.includes("--yes");

  const sql = postgres(connectionString, { prepare: false });
  const today = todayInBangkok();

  try {
    const rows = await sql<
      { id: string; season_name: string; title: string }[]
    >`
      select a.id, s.name as season_name, a.title
      from articles a
      join seasons s on s.id = a.season_id
      where a.published_on = ${today}
    `;

    console.log(`บทความวันที่ ${today} ก่อนลบ: ${rows.length}`);
    for (const row of rows) {
      console.log(`- [${row.season_name}] ${row.title}`);
    }

    if (!confirmed) {
      console.log(
        "ยังไม่ได้ลบอะไรเลย — ยืนยันด้วย: npm run db:delete-today-articles -- --yes",
      );
      return;
    }

    const deleted = await sql<{ id: string }[]>`
      delete from articles
      where published_on = ${today}
      returning id
    `;

    const remaining = await sql<{ count: string }[]>`
      select count(*)::text as count
      from articles
      where published_on = ${today}
    `;

    console.log(`ลบแล้ว: ${deleted.length} รายการ`);
    console.log(`เหลือบทความวันนี้: ${remaining[0]?.count ?? "0"}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("ลบบทความวันนี้ล้มเหลว:", err);
  process.exit(1);
});
