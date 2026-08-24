import type postgres from 'postgres';

import { buildArticleSource, generateArticle } from '@/lib/ai/article';

const MODEL_ID = process.env.ARTICLE_MODEL_ID ?? 'gemini-flash-lite-latest';

// วันที่ตามเวลาไทย ไม่ใช่ UTC — ไม่งั้นบทความของคืนวันนี้จะไปนับเป็นของพรุ่งนี้
// (สำคัญเป็นพิเศษบน production เพราะเซิร์ฟเวอร์ Vercel รันด้วย timezone UTC เสมอ)
export function todayInBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function runGenerateArticle(
  sql: postgres.Sql,
  options: { force?: boolean; date?: string; onLog?: (msg: string) => void } = {},
) {
  const log = options.onLog ?? (() => {});

  const [season] = await sql<{ id: string }[]>`
    select id from seasons where is_active = true limit 1
  `;
  if (!season) {
    throw new Error('ไม่พบ active season — รัน db:sync-fixtures ก่อน');
  }

  // ปกติใช้วันนี้ (ตามเวลาไทย) — ระบุ date เองได้เพื่อสร้างบทความย้อนหลังตอนทดสอบ
  // ข้อจำกัด 1 บทความต่อวันยังอยู่เหมือนเดิม (unique constraint) เพราะมันคือกลไกกันไม่ให้ cron
  // ที่ยิงซ้ำสร้างบทความซ้ำ — แค่เปิดทางให้เลือกได้ว่า "วันไหน" ไม่ได้ปลดล็อกให้สร้างซ้ำวันเดิม
  const today = options.date ?? todayInBangkok();

  // เช็คก่อนเรียก LLM เพื่อไม่ให้เปลืองโควตาฟรีไปกับงานที่ทำไปแล้ว (unique constraint กันซ้ำอยู่แล้ว
  // แต่ถ้าปล่อยให้ไปถึงตรงนั้นก็แปลว่าจ่ายค่าเรียกโมเดลทิ้งไปเปล่า ๆ แล้ว)
  if (!options.force) {
    const [existing] = await sql<{ title: string }[]>`
      select title from articles where season_id = ${season.id} and published_on = ${today}
    `;
    if (existing) {
      log(`มีบทความของวันที่ ${today} อยู่แล้ว: "${existing.title}"`);
      return { processed: 0, skipped: true as const, title: existing.title };
    }
  }

  log(`รวบรวมข้อมูลของวันที่ ${today}...`);
  const source = await buildArticleSource(sql, season.id, today);

  log(`เรียก ${MODEL_ID} เขียนบทความ...`);
  const article = await generateArticle(MODEL_ID, source);

  await sql`
    insert into articles (
      season_id, published_on, title, body, cover_image_urls, model_id, source_snapshot
    )
    values (
      ${season.id}, ${today}, ${article.title}, ${article.body},
      ${source.coverImageUrls}, ${MODEL_ID}, ${JSON.stringify(source)}::jsonb
    )
    on conflict (season_id, published_on) do update set
      title = excluded.title,
      body = excluded.body,
      cover_image_urls = excluded.cover_image_urls,
      model_id = excluded.model_id,
      source_snapshot = excluded.source_snapshot,
      created_at = now()
  `;

  log(`เขียนเสร็จ: "${article.title}"`);
  return { processed: 1, skipped: false as const, title: article.title, body: article.body };
}
