import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

const DEFAULT_COVERS = [
  "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1547347298-4074fc3086f0?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1518604666860-9ed391f76460?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1556056504-5c7696c4c28d?auto=format&fit=crop&w=1200&q=80",
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL in .env.local");
  }

  const sql = postgres(connectionString, { prepare: false });

  try {
    const articles = await sql<{ id: string }[]>`
      select id from articles
    `;

    for (const article of articles) {
      await sql`
        update articles
        set cover_image_urls = ${DEFAULT_COVERS}
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
