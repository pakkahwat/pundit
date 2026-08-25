import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// เพิ่มคอลัมน์ discord_webhook_url กับตาราง notifications_sent เข้ากับฐานข้อมูลที่มีอยู่แล้ว
// เขียนให้รันซ้ำได้ (IF NOT EXISTS ทุกคำสั่ง) เพราะต้องรันทั้ง dev และ production
// รัน: npm run db:migrate-notifications
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing DATABASE_URL');

  const sql = postgres(connectionString, { prepare: false });

  await sql`alter table leagues add column if not exists discord_webhook_url text`;
  await sql`
    create table if not exists notifications_sent (
      id uuid primary key default gen_random_uuid(),
      league_id uuid not null references leagues(id) on delete cascade,
      kind text not null,
      ref text not null,
      sent_at timestamptz not null default now(),
      unique (league_id, kind, ref)
    )
  `;
  await sql`
    create index if not exists notifications_sent_lookup_idx
      on notifications_sent (league_id, kind, sent_at desc)
  `;

  console.log('Migrate notifications สำเร็จ');
  await sql.end();
}

main().catch((err) => {
  console.error('Migrate ล้มเหลว:', err);
  process.exit(1);
});
