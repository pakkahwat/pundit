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

// เขียนคอลัมน์ประจำวัน "ลีกละหนึ่งบท" ให้ทุกลีกฟุตบอลที่ active อยู่
//
// เดิมโค้ดตรงนี้เป็น `select id from seasons where is_active = true limit 1` ซึ่งมีปัญหาสองชั้น:
//   1. ได้บทความวันละบทเดียวทั้งระบบ กลุ่มที่ทายอีกลีกจึงไม่มีคอลัมน์ของตัวเองเลย
//   2. `limit 1` ไม่มี `order by` — Postgres จะคืนแถวไหนมาก็ได้ และเปลี่ยนได้เองระหว่างรัน
//      ผลคือบางวันได้ PL บางวันได้ลาลีกา แล้วแต่ดวง ไม่มีอะไรฟ้องว่าผิด
//
// unique (season_id, published_on) รองรับลีกละบทต่อวันอยู่แล้ว จึงไม่ต้องแก้ schema
export async function runGenerateArticle(
  sql: postgres.Sql,
  options: { force?: boolean; date?: string; onLog?: (msg: string) => void } = {},
) {
  const log = options.onLog ?? (() => {});

  const seasons = await sql<{ id: string; competition_code: string; name: string }[]>`
    select id, competition_code, name from seasons
    where is_active = true
    order by competition_code
  `;
  if (seasons.length === 0) {
    throw new Error('ไม่พบ active season — รัน db:sync-fixtures ก่อน');
  }

  // ปกติใช้วันนี้ (ตามเวลาไทย) — ระบุ date เองได้เพื่อสร้างบทความย้อนหลังตอนทดสอบ
  // ข้อจำกัด 1 บทความต่อลีกต่อวันยังอยู่เหมือนเดิม (unique constraint) เพราะมันคือกลไกกันไม่ให้
  // cron ที่ยิงซ้ำสร้างบทความซ้ำ — แค่เปิดทางให้เลือกได้ว่า "วันไหน" ไม่ได้ปลดล็อกให้สร้างซ้ำวันเดิม
  const today = options.date ?? todayInBangkok();

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const titles: string[] = [];

  for (const season of seasons) {
    const tag = season.competition_code;

    // เช็คก่อนเรียก LLM เพื่อไม่ให้เปลืองโควตาฟรีไปกับงานที่ทำไปแล้ว (unique constraint กันซ้ำ
    // อยู่แล้ว แต่ถ้าปล่อยให้ไปถึงตรงนั้นก็แปลว่าจ่ายค่าเรียกโมเดลทิ้งไปเปล่า ๆ แล้ว)
    if (!options.force) {
      const [existing] = await sql<{ title: string }[]>`
        select title from articles where season_id = ${season.id} and published_on = ${today}
      `;
      if (existing) {
        log(`[${tag}] มีบทความของวันที่ ${today} อยู่แล้ว: "${existing.title}"`);
        skipped++;
        continue;
      }
    }

    // ลีกหนึ่งพังไม่ควรทำให้ลีกที่เหลือไม่ได้บทความ — โควตา LLM หมดกลางคันเป็นเรื่องเกิดได้จริง
    try {
      log(`[${tag}] รวบรวมข้อมูลของวันที่ ${today}...`);
      const source = await buildArticleSource(sql, season.id, today);

      log(`[${tag}] เรียก ${MODEL_ID} เขียนบทความ...`);
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

      log(`[${tag}] เขียนเสร็จ: "${article.title}"`);
      titles.push(article.title);
      processed++;
    } catch (err) {
      failed++;
      log(`[${tag}] เขียนไม่สำเร็จ: ${String(err)}`);
    }
  }

  return { processed, skipped, failed, titles };
}
