import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

// เปิด/ปิดฤดูกาลของลีกหนึ่ง — ทุกงานอัตโนมัติ (sync ผล, AI ทาย, บทความ, แจ้งเตือน) และหน้าสร้างลีก
// อ่านจาก seasons.is_active จึงปิดที่นี่ที่เดียวพอ ข้อมูล/ลีก/คำทายของลีกนั้นยังอยู่ครบ เปิดกลับได้
//
// รัน: npm run db:season-active -- --code=PD --off
//      npm run db:season-active -- --code=PD --on
// อย่าลืมเอาออกจาก/ใส่กลับใน src/lib/football/competitions.ts ด้วย (ลิสต์นั้นคุมหน้า standings)
function argValue(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL ใน .env.local");

  const code = argValue("code")?.toUpperCase();
  const on = process.argv.includes("--on");
  const off = process.argv.includes("--off");
  if (!code || on === off) {
    console.error("ใช้: npm run db:season-active -- --code=PD --off  (หรือ --on)");
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false });
  try {
    // แตะเฉพาะฤดูกาลล่าสุดของลีกนั้น — ถ้า --on เปิดทุกปีพร้อมกัน query ที่ใช้ "is_active limit 1"
    // (ตารางคะแนน, หน้าสร้างลีก) จะสุ่มได้ฤดูกาลไหนก็ไม่รู้
    const rows = await sql<{ name: string; year: number; is_active: boolean }[]>`
      update seasons set is_active = ${on}
      where competition_code = ${code}
        and year = (select max(year) from seasons where competition_code = ${code})
      returning name, year, is_active
    `;
    if (rows.length === 0) {
      console.log(`ไม่พบฤดูกาลของลีก ${code} ใน DB`);
      return;
    }
    for (const r of rows) console.log(`${r.name} (ปี ${r.year}): ${r.is_active ? "เปิด" : "ปิด"}`);
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from leagues l
      join seasons s on s.id = l.season_id where s.competition_code = ${code}
    `;
    if (n > 0) {
      console.log(
        `มีลีกของผู้เล่นในลีกฟุตบอลนี้ ${n} ลีก — ${on ? "กลับมาแสดงตามปกติ" : "จะไม่แสดงในรายการลีกและไม่ได้รับแจ้งเตือน แต่ข้อมูลยังอยู่"}`,
      );
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("set-season-active ล้มเหลว:", err);
  process.exit(1);
});
