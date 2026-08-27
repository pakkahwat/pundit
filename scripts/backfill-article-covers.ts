import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

import { parseRssItems } from "@/lib/ai/article";

config({ path: path.resolve(__dirname, "../.env.local") });

const DEFAULT_COVERS = [
  "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1518091043644-c1d4457512c6?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1552318965-6e6be7484ad6?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&w=1200&q=80",
];

async function isUsableImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return (
      response.ok &&
      (response.headers.get("content-type") ?? "").startsWith("image/")
    );
  } catch {
    return false;
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL in .env.local");
  }

  const sql = postgres(connectionString, { prepare: false });

  try {
    const articles = await sql<{ id: string; season_name: string }[]>`
      select a.id, s.name as season_name
      from articles a
      join seasons s on s.id = a.season_id
    `;

    for (const article of articles) {
      const response = await fetch(
        `https://news.google.com/rss/search?q=${encodeURIComponent(`${article.season_name} football news`)}`,
        { headers: { "User-Agent": "Mozilla/5.0" } },
      );
      const rssItems = response.ok ? parseRssItems(await response.text()) : [];
      const candidateImages = rssItems
        .map((item) => item.imageUrl)
        .filter((url): url is string => Boolean(url));
      const imageChecks = await Promise.all(
        candidateImages.map(async (url) => ({
          url,
          usable: await isUsableImageUrl(url),
        })),
      );
      const newsImages = imageChecks
        .filter((image) => image.usable)
        .map((image) => image.url);
      const covers =
        newsImages.length > 0
          ? [...newsImages, ...DEFAULT_COVERS].slice(0, 6)
          : DEFAULT_COVERS;

      await sql`
        update articles
        set cover_image_urls = ${covers}
        where id = ${article.id}
      `;
    }

    console.log(
      `อัปเดตภาพหน้าปกบทความ ${articles.length} รายการ ให้ใช้สไตล์ฟุตบอลจริงแล้ว`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Backfill cover images ล้มเหลว:", err);
  process.exit(1);
});
