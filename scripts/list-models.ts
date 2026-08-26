import "./lib/prefer-ipv4"; // ต้องมาก่อน import อื่นที่ใช้เน็ต (ดูเหตุผลในไฟล์นั้น)

import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local") });

// ถามผู้ให้บริการว่า "คีย์ของฉันเรียกรุ่นไหนได้บ้าง"
//
// มีไว้เพราะรายชื่อรุ่นเปลี่ยนบ่อยมาก และเอกสารบนเว็บมักลิสต์รุ่นที่ต้องเสียเงินปนมากับรุ่นฟรี
// โดยไม่บอกให้ชัด (เช่น Groq ลิสต์ llama-3.3-70b-versatile ไว้ แต่คีย์ฟรีเรียกแล้วได้ 404
// เพราะมันเป็นรุ่นระดับ Enterprise) — ถามจากคีย์ตัวเองจึงเป็นคำตอบเดียวที่เชื่อได้จริง
//
// รัน: npm run db:list-models -- groq
//      npm run db:list-models -- mistral
//      npm run db:list-models -- google

type Provider = {
  envKey: string;
  url: (apiKey: string) => string;
  headers: (apiKey: string) => Record<string, string>;
  extract: (json: unknown) => string[];
};

const PROVIDERS: Record<string, Provider> = {
  groq: {
    envKey: "GROQ_API_KEY",
    url: () => "https://api.groq.com/openai/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    extract: (json) =>
      (json as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [],
  },
  mistral: {
    envKey: "MISTRAL_API_KEY",
    url: () => "https://api.mistral.ai/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    extract: (json) =>
      (json as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [],
  },
  google: {
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    // Google ใส่คีย์มาใน query string ไม่ใช่ header
    url: (apiKey) =>
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    headers: () => ({}),
    extract: (json) =>
      (
        (
          json as {
            models?: { name: string; supportedGenerationMethods?: string[] }[];
          }
        ).models ?? []
      )
        .filter((m) =>
          m.supportedGenerationMethods?.includes("generateContent"),
        )
        .map((m) => m.name.replace(/^models\//, "")),
  },
  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    url: () => "https://openrouter.ai/api/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    extract: (json) =>
      (json as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [],
  },
  tokenrouter: {
    envKey: "TOKENROUTER_API_KEY",
    url: () => "https://api.tokenrouter.com/v1/models",
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    extract: (json) =>
      (json as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [],
  },
};

async function main() {
  const name = process.argv[2];
  if (!name || !PROVIDERS[name]) {
    console.error(
      `ใช้: npm run db:list-models -- <${Object.keys(PROVIDERS).join("|")}>`,
    );
    process.exit(1);
  }

  const provider = PROVIDERS[name];
  const apiKey = process.env[provider.envKey];
  if (!apiKey) {
    console.error(`ไม่เจอ ${provider.envKey} ใน .env.local`);
    process.exit(1);
  }

  const res = await fetch(provider.url(apiKey), {
    headers: provider.headers(apiKey),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    console.error(
      `${name} ตอบ ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
    process.exit(1);
  }

  const ids = provider.extract(await res.json()).sort();
  console.log(`\nรุ่นที่คีย์นี้เรียกได้บน ${name} (${ids.length} รุ่น):\n`);
  for (const id of ids) console.log(`  ${id}`);
  console.log(
    `\nเลือกรุ่นที่เป็น chat/instruct ทั่วไป (ไม่ใช่ whisper/embed/moderation) แล้วทดสอบด้วย:` +
      `\n  npm run db:test-llm -- ${name} <ชื่อรุ่น>` +
      `\nถ้าผ่านค่อยเอาไปใส่ใน scripts/seed-ai-agents.ts แล้วรัน npm run db:seed-ai-agents\n`,
  );
}

main().catch((err) => {
  console.error("ดึงรายชื่อรุ่นล้มเหลว:", err);
  process.exit(1);
});
