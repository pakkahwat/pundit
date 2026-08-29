import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

import { classifyArticleTopic } from "@/lib/ai/article-cover";
import { resolveFixture, teamNamesFromSource } from "@/lib/ai/article-source";
import { detectTeamsInTitle } from "@/lib/football/team-aliases";
import { sameTeam } from "@/lib/football/team-name";
import { fetchTopicCoverImages } from "@/lib/ai/article-cover-fetch";

config({ path: path.resolve(__dirname, "../.env.local") });

// เขียนทับ cover ของ *ทุก* บทความ จึงต้องยืนยันด้วย --yes เหมือน db:reset-play
// รัน: npm run db:backfill-covers -- --yes   (ใส่ --dry-run เพื่อดูเฉย ๆ ก่อน)
const RSS_DELAY_MS = 1_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


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

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL in .env.local");
  }

  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun && !process.argv.includes("--yes")) {
    console.error(
      "คำสั่งนี้เขียนทับ cover ของบทความทุกใบ ต้องยืนยันด้วย: npm run db:backfill-covers -- --yes",
    );
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false });

  try {
    // ดึง source_snapshot มาด้วยเพื่อรู้ว่าฤดูกาลนั้นมีทีมอะไรบ้าง — กันฉายาไทยที่พ้องกัน
    // ข้ามลีกไปจับทีมที่ไม่ได้เล่นในลีกนั้น (เช่น "ราชัน" ในบทความพรีเมียร์ลีก)
    const crestFor = await makeCrestLookup(sql);

    const articles = await sql<
      {
        id: string;
        season_name: string;
        title: string;
        body: string;
        source_snapshot: Record<string, unknown> | null;
      }[]
    >`
      select a.id, s.name as season_name, a.title, a.body, a.source_snapshot
      from articles a
      join seasons s on s.id = a.season_id
      order by a.published_on desc
    `;

    for (const article of articles) {
      // ใช้ตรรกะชุดเดียวกับตอนสร้างบทความจริง จะได้ไม่มีสองมาตรฐานว่ารูปไหนเหมาะกับหัวข้อไหน
      const topic = classifyArticleTopic(article.title, article.body);
      const knownTeams = article.source_snapshot
        ? teamNamesFromSource(article.source_snapshot)
        : undefined;
      const teams = detectTeamsInTitle(article.title, knownTeams);
      const fixture = article.source_snapshot
        ? resolveFixture(teams, article.source_snapshot, {
            preferUpcoming: topic === "preview",
          })
        : null;
      const { urls: covers, layer } = await fetchTopicCoverImages(
        article.season_name,
        topic,
        article.title,
        { knownTeams, teams, fixture, crestFor },
      );
      // พิมพ์ให้เห็นว่าแต่ละใบใช้ชั้นไหน — ตอน dry-run ดูบรรทัดพวกนี้ก็รู้ทันทีว่าชั้นสนาม/โลโก้
      // ทำงานจริงหรือยังไหลไปชั้นล่างหมดเหมือนก่อน
      console.log(
        `[${topic}/${layer}] ${article.title}` +
          (teams.length ? ` -> ${teams.join(" vs ")}` : ""),
      );

      if (!dryRun) {
        await sql`
          update articles
          set cover_image_urls = ${covers}
          where id = ${article.id}
        `;
      }

      // เว้นจังหวะก่อนยิง RSS ของบทความถัดไป — Google News ตัดการเชื่อมต่อถ้ายิงรัวเกินไป
      await sleep(RSS_DELAY_MS);
    }

    console.log(
      `${dryRun ? "[dry-run] จะอัปเดต" : "อัปเดต"}ภาพหน้าปกบทความ ${articles.length} รายการ`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Backfill cover images ล้มเหลว:", err);
  process.exit(1);
});
