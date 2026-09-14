import "./lib/prefer-ipv4"; // ต้องมาก่อน import อื่นที่ใช้เน็ต (ดูเหตุผลในไฟล์นั้น)

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { config } from "dotenv";
import path from "node:path";
import postgres from "postgres";
import { z } from "zod";

import { isThaiText } from "@/lib/ai/thai-text";

config({ path: path.resolve(__dirname, "../.env.local") });

// แปล reasoning เก่าของ AI ที่ไม่ใช่ภาษาไทย (Qwen เผลอตอบจีน/อังกฤษ ก่อนจะมีตัวกันใน llm.ts)
//
// หลักการ: "แปล" ไม่ใช่ "ทายใหม่" — คำทาย ผล % ความมั่นใจ ไม่ถูกแตะ เปลี่ยนแค่ภาษาของคำอธิบาย
// และเก็บข้อความเดิมไว้ใน raw_response (ถ้ายังว่าง) เพื่อให้ย้อนดูได้ว่าโมเดลตอบอะไรจริง ๆ
// ประโยคที่โมเดลแต่งขึ้นเอง (เช่นอ้างเว็บพนัน) จะยังอยู่ในฉบับแปล เพราะนั่นคือสิ่งที่มันตอบจริง
//
// รัน: npm run db:backfill-thai-reasoning -- --dry-run     ดูว่ามีกี่แถว
//      npm run db:backfill-thai-reasoning -- --yes         แปลจริง (--limit=N จำกัดจำนวน)

const MODEL_ID = process.env.ARTICLE_MODEL_ID ?? "gemini-flash-lite-latest";
// Gemini free tier ราว 15 req/นาที — เว้น 4.5 วิ
const DELAY_MS = 4_500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function argValue(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL ใน .env.local");

  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun && !process.argv.includes("--yes")) {
    console.error(
      "คำสั่งนี้เขียนทับ reasoning ของ AI ต้องยืนยันด้วย: npm run db:backfill-thai-reasoning -- --yes (หรือ --dry-run เพื่อดูก่อน)",
    );
    process.exit(1);
  }
  const limit = Number(argValue("limit") ?? Number.POSITIVE_INFINITY);

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!dryRun && !apiKey) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY ใน .env.local");

  const sql = postgres(connectionString, { prepare: false });
  try {
    const rows = await sql<
      { id: string; reasoning: string; raw_response: string | null; agent_key: string; created_at: Date }[]
    >`
      select l.id, l.reasoning, l.raw_response, a.agent_key, l.created_at
      from ai_prediction_logs l
      join ai_agents a on a.id = l.ai_agent_id
      where l.parse_succeeded and l.reasoning is not null and l.reasoning <> ''
      order by l.created_at
    `;
    const targets = rows.filter((r) => !isThaiText(r.reasoning)).slice(0, limit);

    console.log(
      `reasoning ทั้งหมด ${rows.length} แถว · ไม่ใช่ภาษาไทย ${targets.length} แถว` +
        (Number.isFinite(limit) ? ` (จำกัด ${limit})` : ""),
    );
    const byAgent = new Map<string, number>();
    for (const t of targets) byAgent.set(t.agent_key, (byAgent.get(t.agent_key) ?? 0) + 1);
    for (const [agent, n] of byAgent) console.log(`  ${agent}: ${n}`);

    if (dryRun) {
      for (const t of targets.slice(0, 5)) {
        console.log(`  [${t.agent_key}] ${t.reasoning.replace(/\s+/g, " ").slice(0, 100)}…`);
      }
      return;
    }

    const google = createGoogleGenerativeAI({ apiKey });
    let translated = 0;
    let skipped = 0;
    // ระบุชัดว่าอักษรจีน/เกาหลี/รัสเซีย/อาหรับต้องแปลหมด — ถ้าบอกแค่ "ชื่อคงตามต้นฉบับ" Gemini จะเดาว่า
    // คำแปลกปลอมพวกนั้นเป็นชื่อแล้วคงไว้ (เจอตอนทดสอบ: แปลแล้วยังมี 排名第 ค้าง)
    const translate = async (text: string, note = "") => {
      const { object } = await generateObject({
        model: google(MODEL_ID),
        schema: z.object({
          thai: z.string().describe("คำแปลภาษาไทยของข้อความทั้งหมด"),
        }),
        system:
          "คุณเป็นนักแปล แปลข้อความที่ให้มาเป็นภาษาไทยให้ครบทุกประโยค ห้ามเพิ่ม ห้ามตัด ห้ามแก้ตัวเลขหรือความหมาย " +
          "ชื่อทีม ชื่อคน ชื่อองค์กร ที่เขียนด้วยอักษรละตินคงตามต้นฉบับ ส่วนคำหรือวลีที่เป็นอักษรจีน ญี่ปุ่น เกาหลี " +
          "รัสเซีย หรืออาหรับ ต้องแปลเป็นไทยทั้งหมด ห้ามคงไว้แม้แต่คำเดียว ส่วนที่เป็นภาษาไทยอยู่แล้วให้คงไว้ ตอบเฉพาะคำแปล" +
          note,
        prompt: text,
        // Gemini free tier ช้าได้ถึง 30 วิ+ ช่วงพีค (เจอ timeout ตอนทดสอบ) — งานนี้ไม่มีเพดานเวลา
        // แบบ cron จึงรอได้ยาว แถวที่ยังพังจะถูกข้ามและรันซ้ำครั้งหน้าเก็บได้เพราะยังไม่ใช่ไทยอยู่ดี
        abortSignal: AbortSignal.timeout(60_000),
        maxRetries: 3,
      });
      return object.thai.trim();
    };

    for (const t of targets) {
      try {
        let thai = await translate(t.reasoning);
        if (!isThaiText(thai)) {
          await sleep(DELAY_MS);
          thai = await translate(
            t.reasoning,
            " คำเตือน: คำแปลก่อนหน้ายังมีอักษรที่ไม่ใช่ไทยหรือละตินค้างอยู่ แปลใหม่ให้เป็นไทยล้วน",
          );
        }
        if (!isThaiText(thai)) {
          skipped++;
          console.log(`  ข้าม ${t.id} — คำแปลยังไม่ใช่ไทย: ${thai.slice(0, 60)}…`);
          continue;
        }
        await sql`
          update ai_prediction_logs
          set reasoning = ${thai}, raw_response = coalesce(raw_response, ${t.reasoning})
          where id = ${t.id}
        `;
        translated++;
        console.log(`  [${t.agent_key}] ${thai.replace(/\s+/g, " ").slice(0, 90)}…`);
      } catch (err) {
        skipped++;
        console.log(`  ข้าม ${t.id} — แปลไม่สำเร็จ: ${String(err).slice(0, 120)}`);
      }
      await sleep(DELAY_MS);
    }
    console.log(`แปลแล้ว ${translated} · ข้าม ${skipped}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Backfill thai reasoning ล้มเหลว:", err);
  process.exit(1);
});
