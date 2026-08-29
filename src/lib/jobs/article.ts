import type postgres from 'postgres';

import { buildArticleSource, generateArticle } from '@/lib/ai/article';
import { resolveFixture, teamNamesFromSource } from '@/lib/ai/article-source';
import { detectTeamsInTitle } from '@/lib/football/team-aliases';
import { sameTeam } from '@/lib/football/team-name';
import { classifyArticleTopic } from '@/lib/ai/article-cover';
import { fetchTopicCoverImages } from '@/lib/ai/article-cover-fetch';

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

// ตัวหาโลโก้จากชื่อทีม — โหลดตาราง teams มาทั้งหมดครั้งเดียว (หลักสิบแถว) แล้วเทียบผ่าน sameTeam
// เพราะชื่อที่ส่งเข้ามามีสองแบบปน: ชื่อจาก DB ("Manchester City FC") เมื่อหา fixture เจอ กับชื่อจาก
// ตารางฉายา ("Manchester City") เมื่อเดาจากพาดหัว — เทียบตรงตัวติดแค่แบบแรก
async function makeCrestLookup(
  sql: postgres.Sql,
): Promise<(team: string) => string | null> {
  const rows = await sql<{ name: string; crest_url: string | null }[]>`
    select name, crest_url from teams
  `;
  return (team) =>
    rows.find((row) => sameTeam(row.name, team))?.crest_url ?? null;
}

export async function runGenerateArticle(
  sql: postgres.Sql,
  options: { force?: boolean; date?: string; onLog?: (msg: string) => void } = {},
) {
  const log = options.onLog ?? (() => {});
  const crestFor = await makeCrestLookup(sql);

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

      // หารูปหน้าปกหลังรู้พาดหัวแล้วเท่านั้น — ตอนสร้าง source ยังไม่มีอะไรบอกว่าบทความจะพูดเรื่องอะไร
      // ถ้าเลือกรูปตั้งแต่ตอนนั้นก็ได้แต่รูปกลาง ๆ ของทั้งลีก ซ้ำกันทุกใบ (ดู lib/ai/article-cover.ts)
      const topic = classifyArticleTopic(article.title, article.body);
      const knownTeams = teamNamesFromSource(source);
      const teams = detectTeamsInTitle(article.title, knownTeams);
      const fixture = resolveFixture(teams, source, {
        preferUpcoming: topic === 'preview',
      });
      const { urls: coverImageUrls, layer } = await fetchTopicCoverImages(
        season.name,
        topic,
        article.title,
        { knownTeams, teams, fixture, crestFor },
      );
      log(
        `[${tag}] หัวข้อ: ${topic} · ภาพจากชั้น: ${layer}` +
          (fixture ? ` (${fixture.homeTeam} vs ${fixture.awayTeam})` : ''),
      );

      await sql`
        insert into articles (
          season_id, published_on, title, body, cover_image_urls, model_id, source_snapshot
        )
        values (
          ${season.id}, ${today}, ${article.title}, ${article.body},
          ${coverImageUrls}, ${MODEL_ID}, ${JSON.stringify(source)}::jsonb
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
