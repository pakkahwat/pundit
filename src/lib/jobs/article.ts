import type postgres from 'postgres';

import {
  buildArticleSource,
  buildPreviewSource,
  generateArticle,
  generatePreviewArticle,
  type GeneratedArticle,
} from '@/lib/ai/article';
import {
  coverExtrasFor,
  looksLikeTip,
  resolveFixture,
  resolveFocusTeams,
  teamNamesFromSource,
  type ResolvedFixture,
} from '@/lib/ai/article-source';
import { detectTeamsInTitle } from '@/lib/football/team-aliases';
import { sameTeam } from '@/lib/football/team-name';
import { classifyArticleTopic, type ArticleTopic } from '@/lib/ai/article-cover';
import { buildArticleCover } from '@/lib/ai/article-cover-fetch';
import { getCurrentMatchday } from '@/lib/matches/current-matchday';
import { reportOps } from '@/lib/notify/ops';

const MODEL_ID = process.env.ARTICLE_MODEL_ID ?? 'gemini-flash-lite-latest';

// พรีวิวเขียนเมื่อเหลือไม่ถึงเท่านี้ก่อนนัดแรกของแมตช์เดย์ — cron ยิงวันละครั้งตอนเช้า ช่วง 48 ชม.
// จึงครอบคลุมทั้ง "เช้าวันก่อนเตะ" และ "เช้าวันเตะ" (ถ้าพลาดรอบหนึ่งก็ยังทันอีกรอบ)
const PREVIEW_WINDOW_MS = 48 * 60 * 60 * 1000;

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

// เขียนคอลัมน์ประจำวัน "ลีกละหนึ่งบท" ให้ทุกลีกฟุตบอลที่ active อยู่ + พรีวิวก่อนแมตช์เดย์เมื่อถึงเวลา
//
// เดิมโค้ดตรงนี้เป็น `select id from seasons where is_active = true limit 1` ซึ่งมีปัญหาสองชั้น:
//   1. ได้บทความวันละบทเดียวทั้งระบบ กลุ่มที่ทายอีกลีกจึงไม่มีคอลัมน์ของตัวเองเลย
//   2. `limit 1` ไม่มี `order by` — Postgres จะคืนแถวไหนมาก็ได้ และเปลี่ยนได้เองระหว่างรัน
//      ผลคือบางวันได้ PL บางวันได้ลาลีกา แล้วแต่ดวง ไม่มีอะไรฟ้องว่าผิด
//
// กันซ้ำแยกตามชนิดด้วย partial unique index: คอลัมน์ (season_id, published_on) where kind='daily'
// ส่วนพรีวิว (season_id, matchday) where kind='preview' — ดูเหตุผลใน scripts/migrate-article-kinds.ts

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

type SeasonRow = { id: string; competition_code: string; name: string };
type CrestLookup = (team: string) => string | null;

// ทีมหลักของบทความ: เชื่อที่โมเดลบอก (focusTeams) ก่อน เพราะมันรู้ว่าตัวเองเขียนถึงใคร แล้วค่อยถอยไป
// เดาจากฉายาในพาดหัวแบบเดิมเมื่อโมเดลไม่ให้มาหรือให้ชื่อที่ไม่มีในลีก
function pickTeams(
  focusTeams: string[] | undefined,
  title: string,
  knownTeams: string[],
): string[] {
  const resolved = resolveFocusTeams(focusTeams, knownTeams);
  return resolved.length > 0 ? resolved : detectTeamsInTitle(title, knownTeams);
}

// หารูปหน้าปกหลังรู้พาดหัวแล้วเท่านั้น — ตอนสร้าง source ยังไม่มีอะไรบอกว่าบทความจะพูดเรื่องอะไร
// ถ้าเลือกรูปตั้งแต่ตอนนั้นก็ได้แต่รูปกลาง ๆ ของทั้งลีก ซ้ำกันทุกใบ (ดู lib/ai/article-cover.ts)
async function coverFor(args: {
  seasonName: string;
  topic: ArticleTopic;
  article: GeneratedArticle;
  source: Parameters<typeof teamNamesFromSource>[0] & Parameters<typeof coverExtrasFor>[1];
  crestFor: CrestLookup;
  labelOverride?: string;
}) {
  const { seasonName, topic, article, source, crestFor, labelOverride } = args;
  const knownTeams = teamNamesFromSource(source);
  const teams = pickTeams(article.focusTeams, article.title, knownTeams);
  const fixture: ResolvedFixture | null = resolveFixture(teams, source, {
    preferUpcoming: topic === 'preview',
  });
  const extras = coverExtrasFor(topic, source, fixture);
  const cover = await buildArticleCover({
    seasonName,
    topic,
    title: article.title,
    knownTeams,
    teams,
    fixture,
    crestFor,
    imageQuery: article.imageQuery,
    score: extras.score,
    label: labelOverride ?? extras.label,
  });
  return { ...cover, teams, fixture };
}

async function writeDaily(
  sql: postgres.Sql,
  season: SeasonRow,
  today: string,
  crestFor: CrestLookup,
  force: boolean,
  log: (msg: string) => void,
): Promise<{ status: 'written' | 'skipped'; title?: string }> {
  const tag = season.competition_code;

  // เช็คก่อนเรียก LLM เพื่อไม่ให้เปลืองโควตาฟรีไปกับงานที่ทำไปแล้ว (unique constraint กันซ้ำ
  // อยู่แล้ว แต่ถ้าปล่อยให้ไปถึงตรงนั้นก็แปลว่าจ่ายค่าเรียกโมเดลทิ้งไปเปล่า ๆ แล้ว)
  if (!force) {
    const [existing] = await sql<{ title: string }[]>`
      select title from articles
      where season_id = ${season.id} and kind = 'daily' and published_on = ${today}
    `;
    if (existing) {
      log(`[${tag}] มีบทความของวันที่ ${today} อยู่แล้ว: "${existing.title}"`);
      return { status: 'skipped' };
    }
  }

  log(`[${tag}] รวบรวมข้อมูลของวันที่ ${today}...`);
  const source = await buildArticleSource(sql, season.id, today);

  log(`[${tag}] เรียก ${MODEL_ID} เขียนบทความ...`);
  const article = await generateArticle(MODEL_ID, source);

  const topic = classifyArticleTopic(article.title, article.body);
  const { urls, layer, fixture } = await coverFor({
    seasonName: season.name,
    topic,
    article,
    source,
    crestFor,
  });
  log(
    `[${tag}] หัวข้อ: ${topic} · ภาพจากชั้น: ${layer}` +
      (fixture ? ` (${fixture.homeTeam} vs ${fixture.awayTeam})` : ''),
  );

  await sql`
    insert into articles (
      season_id, published_on, kind, title, body, cover_image_urls, model_id, source_snapshot
    )
    values (
      ${season.id}, ${today}, 'daily', ${article.title}, ${article.body},
      ${urls}, ${MODEL_ID}, ${JSON.stringify(source)}::jsonb
    )
    on conflict (season_id, published_on) where kind = 'daily' do update set
      title = excluded.title,
      body = excluded.body,
      cover_image_urls = excluded.cover_image_urls,
      model_id = excluded.model_id,
      source_snapshot = excluded.source_snapshot,
      created_at = now()
  `;

  log(`[${tag}] เขียนเสร็จ: "${article.title}"`);
  return { status: 'written', title: article.title };
}

// พรีวิวของแมตช์เดย์ปัจจุบัน — เขียนเมื่อนัดแรกที่ยังไม่เตะเหลือไม่ถึง PREVIEW_WINDOW_MS และยังไม่เคย
// เขียนพรีวิวของแมตช์เดย์นี้ (force = เขียนทับ)
async function writePreview(
  sql: postgres.Sql,
  season: SeasonRow,
  today: string,
  crestFor: CrestLookup,
  force: boolean,
  log: (msg: string) => void,
): Promise<{ status: 'written' | 'skipped' | 'not-due'; title?: string }> {
  const tag = season.competition_code;

  const matchday = await getCurrentMatchday(season.id, sql);
  if (!matchday) return { status: 'not-due' };

  const [next] = await sql<{ first_ko: string | Date | null }[]>`
    select min(kickoff_at) as first_ko from matches
    where season_id = ${season.id} and matchday = ${matchday} and kickoff_at > now()
  `;
  if (!next?.first_ko) return { status: 'not-due' };

  const msUntil = new Date(next.first_ko).getTime() - Date.now();
  if (msUntil > PREVIEW_WINDOW_MS) {
    log(
      `[${tag}] พรีวิวแมตช์เดย์ ${matchday} ยังไม่ถึงเวลา (นัดแรกอีก ${Math.round(msUntil / 3_600_000)} ชม.)`,
    );
    return { status: 'not-due' };
  }

  if (!force) {
    const [existing] = await sql<{ title: string }[]>`
      select title from articles
      where season_id = ${season.id} and kind = 'preview' and matchday = ${matchday}
    `;
    if (existing) {
      log(`[${tag}] มีพรีวิวแมตช์เดย์ ${matchday} อยู่แล้ว: "${existing.title}"`);
      return { status: 'skipped' };
    }
  }

  log(`[${tag}] รวบรวมข้อมูลพรีวิวแมตช์เดย์ ${matchday}...`);
  const source = await buildPreviewSource(sql, season.id, matchday, today);
  if (source.fixtures.length === 0) return { status: 'not-due' };

  log(`[${tag}] เรียก ${MODEL_ID} เขียนพรีวิว...`);
  let article = await generatePreviewArticle(MODEL_ID, source);

  // กติกาห้ามชี้นำผลอยู่ใน prompt ก็จริง แต่โมเดลหลุดได้ — เช็คซ้ำด้วย regex (looksLikeTip) ถ้าเจอให้
  // เขียนใหม่หนึ่งครั้งพร้อมกำชับ ยังหลุดอีกก็ไม่เผยแพร่ (พรุ่งนี้ cron ลองใหม่) เพราะพรีวิวที่บอกใบ้
  // ผลก่อนคิกออฟทำให้การแข่งคน vs AI เสียไปทั้งแมตช์เดย์ แย่กว่าไม่มีพรีวิว
  if (looksLikeTip(article.title) || looksLikeTip(article.body)) {
    log(`[${tag}] พรีวิวมีประโยคชี้นำผล — ให้เขียนใหม่อีกครั้ง`);
    article = await generatePreviewArticle(MODEL_ID, source, { stricter: true });
    if (looksLikeTip(article.title) || looksLikeTip(article.body)) {
      throw new Error('พรีวิวยังมีประโยคชี้นำผลหลังเขียนใหม่ — ไม่เผยแพร่');
    }
  }

  const { urls, layer, fixture } = await coverFor({
    seasonName: season.name,
    topic: 'preview',
    article,
    source,
    crestFor,
  });
  log(
    `[${tag}] พรีวิว · ภาพจากชั้น: ${layer}` +
      (fixture ? ` (${fixture.homeTeam} vs ${fixture.awayTeam})` : ''),
  );

  // ชนกับพรีวิวเดิมของแมตช์เดย์นี้ (ทางเดียวที่ชนได้ คือ force) = เขียนทับในที่ ไม่ต้องลบก่อน
  await sql`
    insert into articles (
      season_id, published_on, kind, matchday, title, body, cover_image_urls, model_id, source_snapshot
    )
    values (
      ${season.id}, ${today}, 'preview', ${matchday}, ${article.title}, ${article.body},
      ${urls}, ${MODEL_ID}, ${JSON.stringify(source)}::jsonb
    )
    on conflict (season_id, matchday) where kind = 'preview' do update set
      published_on = excluded.published_on,
      title = excluded.title,
      body = excluded.body,
      cover_image_urls = excluded.cover_image_urls,
      model_id = excluded.model_id,
      source_snapshot = excluded.source_snapshot,
      created_at = now()
  `;

  log(`[${tag}] พรีวิวเสร็จ: "${article.title}"`);
  return { status: 'written', title: article.title };
}

export async function runGenerateArticle(
  sql: postgres.Sql,
  options: {
    force?: boolean;
    date?: string;
    /** เขียนเฉพาะพรีวิว (ใช้ทดสอบจาก CLI) */
    previewOnly?: boolean;
    /** ไม่แตะพรีวิวเลย — CLI ใช้ตอนเขียนคอลัมน์ย้อนหลัง (--date/--days) เพราะพรีวิวอิง now() ไม่ใช่วันที่ระบุ */
    skipPreview?: boolean;
    onLog?: (msg: string) => void;
  } = {},
) {
  const log = options.onLog ?? (() => {});
  const force = options.force ?? false;
  const crestFor = await makeCrestLookup(sql);

  const seasons = await sql<SeasonRow[]>`
    select id, competition_code, name from seasons
    where is_active = true
    order by competition_code
  `;
  if (seasons.length === 0) {
    throw new Error('ไม่พบ active season — รัน db:sync-fixtures ก่อน');
  }

  // ปกติใช้วันนี้ (ตามเวลาไทย) — ระบุ date เองได้เพื่อสร้างบทความย้อนหลังตอนทดสอบ
  // ข้อจำกัด 1 บทความต่อลีกต่อชนิดต่อวันยังอยู่เหมือนเดิม (unique constraint) เพราะมันคือกลไกกันไม่ให้
  // cron ที่ยิงซ้ำสร้างบทความซ้ำ — แค่เปิดทางให้เลือกได้ว่า "วันไหน" ไม่ได้ปลดล็อกให้สร้างซ้ำวันเดิม
  const today = options.date ?? todayInBangkok();

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let previews = 0;
  let lastError = '';
  const titles: string[] = [];

  for (const season of seasons) {
    const tag = season.competition_code;

    // ลีกหนึ่งพังไม่ควรทำให้ลีกที่เหลือไม่ได้บทความ — โควตา LLM หมดกลางคันเป็นเรื่องเกิดได้จริง
    if (!options.previewOnly) {
      try {
        const daily = await writeDaily(sql, season, today, crestFor, force, log);
        if (daily.status === 'written') {
          processed++;
          if (daily.title) titles.push(daily.title);
        } else {
          skipped++;
        }
      } catch (err) {
        failed++;
        lastError = String(err);
        log(`[${tag}] เขียนไม่สำเร็จ: ${lastError}`);
      }
    }

    // พรีวิวแยก try ของตัวเอง — คอลัมน์ประจำวันพังไม่ควรพาพรีวิวพังตาม และกลับกัน
    if (!options.skipPreview) {
      try {
        const preview = await writePreview(sql, season, today, crestFor, force, log);
        if (preview.status === 'written') {
          previews++;
          if (preview.title) titles.push(preview.title);
        }
      } catch (err) {
        failed++;
        lastError = String(err);
        log(`[${tag}] เขียนพรีวิวไม่สำเร็จ: ${lastError}`);
      }
    }
  }

  // งานนี้กลืน error รายลีกไว้ (withCronRun จึงเห็นเป็น success เสมอ) — ต้องฟ้อง ops เองเมื่อ
  // "พังโดยไม่มีบทความใหม่เลย" ไม่งั้นโควตา Gemini หมดแล้วบทความหายทุกวันจะไม่มีใครรู้
  if (failed > 0 && processed + previews === 0) {
    await reportOps(
      sql,
      'articles',
      'error',
      `เขียนไม่สำเร็จ ${failed} รายการ ไม่มีบทความใหม่เลยในรอบนี้\n${lastError}`,
      log,
    );
  } else if (processed + previews > 0) {
    await reportOps(sql, 'articles', 'ok', null, log);
  }

  return { processed, skipped, failed, previews, titles };
}
