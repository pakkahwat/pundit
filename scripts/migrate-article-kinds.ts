import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

// บทความมีสองชนิดแล้ว: 'daily' (คอลัมน์ประจำวัน) กับ 'preview' (พรีวิวก่อนแมตช์เดย์)
// กันซ้ำแยกตามชนิดด้วย partial unique index คนละตัว:
//   - daily   ซ้ำไม่ได้ในวันเดียวกัน            (season_id, published_on) where kind = 'daily'
//   - preview ซ้ำไม่ได้ในแมตช์เดย์เดียวกัน        (season_id, matchday)     where kind = 'preview'
// จงใจไม่ผูก preview กับวันที่ — ถ้าผูก (season, kind, published_on) แล้ววันเดียวกันมีพรีวิวสองแมตช์เดย์
// (แมตช์เดย์ N เตะเช้า แล้ว N+1 กลางสัปดาห์เข้าช่วง 48 ชม.พอดี) ใบหลังจะเขียนทับใบแรกเงียบ ๆ
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL ใน .env.local");

  const sql = postgres(connectionString, { prepare: false });
  try {
    await sql`alter table articles add column if not exists kind text not null default 'daily'`;
    await sql`alter table articles add column if not exists matchday integer`;
    await sql`alter table articles drop constraint if exists articles_season_id_published_on_key`;
    // ร่างแรกของ migration นี้เคยสร้าง unique รวมชนิด — ถอดออกถ้ามี (DB dev)
    await sql`drop index if exists articles_season_id_kind_published_on_key`;
    await sql`
      create unique index if not exists articles_daily_published_on_key
      on articles (season_id, published_on) where kind = 'daily'
    `;
    await sql`
      create unique index if not exists articles_preview_matchday_key
      on articles (season_id, matchday) where kind = 'preview'
    `;
    console.log("เพิ่ม articles.kind / articles.matchday และ partial unique index ตามชนิดสำเร็จ");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migrate article kinds ล้มเหลว:", err);
  process.exit(1);
});
