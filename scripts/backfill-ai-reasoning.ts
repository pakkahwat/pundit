import { config } from "dotenv";
import postgres from "postgres";
import path from "node:path";

import { extractReasoningFromLogPrompt } from "@/lib/ai/prediction-log";

// dotenv ไม่เขียนทับค่าที่มีอยู่แล้วใน process.env (override: false เป็นค่า default) — ตั้ง
// $env:DATABASE_URL ชี้ไป prod ก่อนรัน แล้วค่านั้นจะชนะ .env.local เอง เป็นวิธีเดียวกับที่ DEPLOY.md ใช้
config({ path: path.resolve(__dirname, "../.env.local") });

// เติมคอลัมน์ ai_prediction_logs.reasoning ให้แถวเก่าที่เขียนไว้ก่อนคอลัมน์นี้จะมีอยู่
//
// ที่มาของปัญหา: หน้า reveal อ่านเหตุผลจาก apl.reasoning ตรง ๆ แถวที่ AI ทายไว้ก่อนวันที่รัน
// db:migrate-ai-reasoning จึงเป็น null หมด ผลคือบางแมตช์โชว์เหตุผลครบทุกตัว (นัดที่ทายหลัง migrate)
// แต่บางแมตช์โชว์แค่ AI ตัวที่เพิ่งถูกเพิ่มเข้ามาทีหลัง เพราะมีแต่ตัวนั้นที่ทายหลัง migrate
//
// ข่าวดีคือข้อความไม่ได้หายไปไหน — มันถูกต่อท้ายไว้ในคอลัมน์ prompt ตั้งแต่แรกอยู่แล้ว
// สคริปต์นี้แค่แยกออกมาเก็บเป็นคอลัมน์ของตัวเอง เขียนเฉพาะแถวที่ reasoning ยังว่าง จึงรันซ้ำได้ปลอดภัย
// และไม่มีทางทับของที่ถูกต้องอยู่แล้ว
//
// ปกติต้องรันกับ production เพราะข้อมูลคำทายบนเครื่อง dev ไม่เท่ากัน:
//   $env:DATABASE_URL="<prod pooled connection string>"
//   npm run db:backfill-ai-reasoning -- --dry-run
//   npm run db:backfill-ai-reasoning
//   Remove-Item Env:DATABASE_URL
// สคริปต์จะพิมพ์ host ที่กำลังจะเขียนให้ดูก่อนเสมอ — เช็คให้ชัวร์ว่าไม่ได้ยิงผิดฐาน

// เขียนทีละก้อนแทนการยิง UPDATE ทีละแถว — เวลารันข้ามเครื่องไปหา Neon ค่า round-trip ต่อคำสั่ง
// คือต้นทุนหลัก ยิงทีละแถวเป็นพัน ๆ ครั้งจะกินเวลาเป็นนาที ๆ โดยไม่จำเป็น
const BATCH_SIZE = 200;

function describeTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.host}${url.pathname}`;
  } catch {
    return "(อ่าน connection string ไม่ออก)";
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL ใน .env.local");

  const dryRun = process.argv.includes("--dry-run");
  console.log(`ฐานข้อมูลปลายทาง: ${describeTarget(connectionString)}`);
  console.log(dryRun ? "โหมด: dry-run (ไม่เขียนอะไร)" : "โหมด: เขียนจริง");

  const sql = postgres(connectionString, { prepare: false });

  try {
    const rows = await sql<{ id: string; prompt: string | null }[]>`
      select id, prompt
      from ai_prediction_logs
      where (reasoning is null or reasoning = '')
        and parse_succeeded = true
    `;

    const updates: { id: string; reasoning: string }[] = [];
    let unparsable = 0;

    for (const row of rows) {
      const reasoning = extractReasoningFromLogPrompt(row.prompt);
      if (reasoning) updates.push({ id: row.id, reasoning });
      else unparsable++;
    }

    if (!dryRun) {
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        await sql`
          update ai_prediction_logs as l
          set reasoning = v.reasoning
          from unnest(
            ${batch.map((u) => u.id)}::uuid[],
            ${batch.map((u) => u.reasoning)}::text[]
          ) as v(id, reasoning)
          where l.id = v.id
        `;
        console.log(`  เขียนแล้ว ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length}`);
      }
    }

    console.log(`แถวที่ยังไม่มีเหตุผล: ${rows.length}`);
    console.log(
      `${dryRun ? "[dry-run] จะเติมได้" : "เติมแล้ว"}: ${updates.length} แถว`,
    );
    console.log(`แยกเหตุผลออกจาก prompt ไม่ได้ (ข้ามไป): ${unparsable} แถว`);
    if (dryRun) console.log("นี่คือ dry-run — ยังไม่ได้เขียนอะไรลงฐานข้อมูล");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Backfill AI reasoning ล้มเหลว:", err);
  process.exit(1);
});
