import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL ใน .env.local");

  const sql = postgres(connectionString, { prepare: false });
  try {
    await sql`
      alter table ai_prediction_logs
      add column if not exists reasoning text
    `;
    console.log("เพิ่มคอลัมน์ ai_prediction_logs.reasoning สำเร็จ");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Migrate AI reasoning ล้มเหลว:", err);
  process.exit(1);
});
