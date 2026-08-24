import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// migration: เพิ่มตาราง articles (บทความข่าวที่ AI เขียนรายวัน)
// ใช้ IF NOT EXISTS ทั้งหมด รันซ้ำได้ปลอดภัย — ไม่แตะข้อมูลเดิมเลย
// รัน: npm run db:migrate-articles

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL ใน .env.local');
  }
  const sql = postgres(connectionString, { prepare: false });

  try {
    await sql`
      create table if not exists articles (
        id uuid primary key default gen_random_uuid(),
        season_id uuid not null references seasons(id) on delete cascade,
        published_on date not null,
        title text not null,
        body text not null,
        model_id text,
        source_snapshot jsonb not null,
        created_at timestamptz not null default now(),
        unique (season_id, published_on)
      )
    `;
    await sql`create index if not exists articles_published_idx on articles (published_on desc)`;
    // เพิ่มทีหลังแยกจาก create table เพื่อให้คนที่รัน migration รอบก่อนไปแล้วได้คอลัมน์นี้ด้วย
    await sql`
      alter table articles add column if not exists cover_image_urls text[] not null default '{}'
    `;
    console.log('สร้าง/อัปเดตตาราง articles เรียบร้อย');
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Migration ล้มเหลว:', err);
  process.exit(1);
});
