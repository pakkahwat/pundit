import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

import { BADGES, BADGE_KEYS } from "@/lib/stats/badges";

config({ path: path.resolve(__dirname, "../.env.local") });

// วาดรูปเหรียญตราด้วย Gemini (โมเดล image generation) ลง public/badges/<key>.png
//
// เป็นของตกแต่งล้วน ๆ และรันครั้งเดียวพอ: หน้าเว็บมี emoji fallback ต่อเหรียญอยู่แล้ว
// (ดู BadgeIcon ใน components/profile-name.tsx) ไฟล์ไหน gen ไม่ผ่านหรือยังไม่ได้รัน
// ก็ไม่มีอะไรพัง — ข้ามไฟล์ที่มีอยู่แล้วเสมอ อยาก gen ใหม่ให้ลบไฟล์นั้นทิ้งก่อน
//
// หมายเหตุ: image generation อาจไม่เปิดให้ทุกบัญชี/ภูมิภาคบน free tier — ถ้าโดนปฏิเสธ
// สคริปต์จะบอกตรง ๆ ต่อเหรียญ ไม่ล้มทั้งงาน

const MODEL = "gemini-2.5-flash-image";

const STYLE = `Design a small circular achievement badge icon for a football
prediction game. Flat vector style, bold colors, dark navy background circle
with gold rim, no text anywhere, centered composition, crisp at small sizes.`;

async function generateBadge(
  apiKey: string,
  prompt: string,
): Promise<Buffer | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${STYLE}\n\nBadge theme: ${prompt}` }] }],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { data?: string } }[] };
    }[];
  };
  const image = payload.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data,
  )?.inlineData?.data;
  return image ? Buffer.from(image, "base64") : null;
}

async function main() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY ใน .env.local");

  const outDir = path.resolve(__dirname, "../public/badges");
  fs.mkdirSync(outDir, { recursive: true });

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const key of BADGE_KEYS) {
    const file = path.join(outDir, `${key}.png`);
    if (fs.existsSync(file)) {
      skipped++;
      continue;
    }

    const badge = BADGES[key];
    try {
      const image = await generateBadge(
        apiKey,
        `"${badge.label}" — ${badge.description} (motif hint: ${badge.emoji})`,
      );
      if (!image) {
        failed++;
        console.log(`✘ ${key} — โมเดลไม่คืนรูปมา`);
        continue;
      }
      fs.writeFileSync(file, image);
      created++;
      console.log(`✔ ${key} → public/badges/${key}.png`);
    } catch (err) {
      failed++;
      const message = String(err);
      // 429 บนคีย์ free tier = โมเดล image generation ไม่มีโควตาฟรีเลย ไม่ใช่แค่ยิงถี่ไป
      // บอกตรง ๆ ครั้งเดียวแล้วหยุด — ไล่ยิงต่ออีก 20 เหรียญก็ได้ 429 เหมือนกันหมด
      if (/HTTP 429/.test(message)) {
        console.log(
          `✘ ${key} — โควตา image generation หมด/ไม่มีใน free tier ` +
            "(ต้องเปิด billing ใน Google AI Studio ก่อน) — หยุดที่นี่ " +
            "เหรียญทุกใบยังแสดงเป็นเหรียญ CSS ในเว็บตามปกติ",
        );
        break;
      }
      console.log(`✘ ${key} — ${message.slice(0, 150)}`);
    }
  }

  console.log(`\nสร้างใหม่ ${created} · มีอยู่แล้ว ${skipped} · ล้มเหลว ${failed}`);
  if (failed > 0) {
    console.log("เหรียญที่ล้มเหลวจะแสดงเป็น emoji ไปก่อน — รันซ้ำได้ทุกเมื่อ");
  }
}

main().catch((err) => {
  console.error("สร้างรูปเหรียญล้มเหลว:", err);
  process.exit(1);
});
