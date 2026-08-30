import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { generateObject } from "ai";
import { z } from "zod";

import {
  PREDICTION_OUTCOMES,
  type PredictionOutcome,
} from "../predictions/outcome";
import type { FormEntry, MatchContext } from "./context";

// schema ที่บังคับให้โมเดลตอบกลับมาเป็นโครงสร้างนี้เท่านั้น — generateObject จะ retry ให้เองถ้า
// โมเดลตอบผิดรูป เลยไม่ต้องเขียนโค้ด parse ข้อความดิบ ๆ หรือ regex งม JSON เอง
const predictionSchema = z.object({
  outcome: z.enum(
    PREDICTION_OUTCOMES as [PredictionOutcome, ...PredictionOutcome[]],
  ),
  reasoning: z.string().describe("เหตุผลสั้น ๆ ไม่เกิน 2 ประโยค เป็นภาษาไทย"),
});

const SYSTEM_PROMPT = `คุณเป็นนักวิเคราะห์ฟุตบอลพรีเมียร์ลีก หน้าที่คือทายว่าแมตช์ที่กำหนดจะจบด้วยผลใด
ตอบได้ 3 อย่างเท่านั้น: HOME (ทีมเหย้าชนะ), DRAW (เสมอ), AWAY (ทีมเยือนชนะ)

ข้อมูลที่ให้มาคือทั้งหมดที่คุณมี — ห้ามอ้างอิงข้อมูลอื่นที่คุณคิดว่ารู้ เช่น ข่าวการย้ายทีม อาการบาดเจ็บ
หรือผลการแข่งขันที่ไม่ได้อยู่ในข้อมูลนี้ เพราะข้อมูลนั้นอาจเป็นเหตุการณ์ที่ยังไม่เกิดขึ้น ณ เวลาที่ทาย
ให้วิเคราะห์จากฟอร์มล่าสุด สถิติการเจอกัน ตารางคะแนน และความได้เปรียบของการเล่นในบ้านเท่านั้น

อย่าเลี่ยงตอบ DRAW เพื่อความปลอดภัย ถ้าข้อมูลชี้ชัดว่าฝ่ายใดเหนือกว่าให้ฟันธงไปเลย`;

function formLine(entries: FormEntry[]): string {
  if (entries.length === 0) return "ไม่มีข้อมูล";
  return entries
    .map(
      (e) =>
        `${e.result} ${e.goalsFor}-${e.goalsAgainst} ${e.isHome ? "เหย้า" : "เยือน"} พบ ${e.opponent}`,
    )
    .join(" | ");
}

// แปลง MatchContext เป็นข้อความให้โมเดลอ่าน — เก็บ prompt ที่ส่งจริงลง ai_prediction_logs ด้วย
// เพื่อให้ย้อนตรวจได้ว่าโมเดลเห็นอะไรตอนตัดสินใจ (ไม่ใช่แค่เชื่อว่ามันเห็นสิ่งที่เราคิดว่าส่งไป)
export function buildPrompt(ctx: MatchContext): string {
  // ตัดตารางคะแนนเหลือ 3 อันดับแรกกับตำแหน่งของสองทีมนี้ — ส่งทั้ง 20 ทีมเปลืองโทเคนโดยไม่ช่วยอะไร
  const standingsLines = ctx.standings
    .map((s, i) => ({ ...s, rank: i + 1 }))
    .filter(
      (s) => s.rank <= 3 || s.team === ctx.homeTeam || s.team === ctx.awayTeam,
    )
    .map(
      (s) =>
        `อันดับ ${s.rank}: ${s.team} — ${s.points} แต้ม จาก ${s.played} นัด (ยิง ${s.goalsFor} เสีย ${s.goalsAgainst})`,
    )
    .join("\n");

  return `แมตช์: ${ctx.homeTeam} (เหย้า) พบ ${ctx.awayTeam} (เยือน)

ฟอร์ม 5 นัดหลังสุดของ ${ctx.homeTeam}:
${formLine(ctx.homeForm)}

ฟอร์ม 5 นัดหลังสุดของ ${ctx.awayTeam}:
${formLine(ctx.awayForm)}

สถิติการเจอกัน 5 นัดหลังสุด (มุมมองของ ${ctx.homeTeam}):
${formLine(ctx.headToHead)}

ตารางคะแนน ณ ตอนนี้:
${standingsLines || "ยังไม่มีข้อมูล"}

ทายผลแมตช์นี้`;
}

export type LlmPredictionResult = {
  outcome: PredictionOutcome;
  reasoning: string;
  prompt: string;
  latencyMs: number;
};

// ── ผู้ให้บริการโมเดล ─────────────────────────────────────────────────────────
//
// ผู้เล่น AI แต่ละตัวเก็บ provider + model_id ไว้ใน DB (ตาราง ai_agents) ไม่ได้ hardcode ในโค้ด
// เพิ่ม/เปลี่ยนรุ่นจึงทำได้ที่ scripts/seed-ai-agents.ts อย่างเดียว
//
// สำคัญต่อความเป็นการทดลองที่ยุติธรรม: ทุก provider ใช้ prompt เดียวกัน schema เดียวกัน และ
// context เดียวกันเป๊ะ ๆ (ดู buildPrompt ข้างบน) — ตัวแปรเดียวที่ต่างกันคือ "โมเดล" เท่านั้น
// ถ้าเผลอปรับ prompt ให้ตัวใดตัวหนึ่งเป็นพิเศษ ผลเปรียบเทียบทั้งฤดูกาลจะใช้ไม่ได้ทันที
const PROVIDERS: Record<
  string,
  { envKey: string; build: (apiKey: string, modelId: string) => LanguageModel }
> = {
  // ใช้ provider ตรงของ AI SDK ไม่ใช่ OpenAI-compat endpoint — generateObject ต้องการ
  // structured output ซึ่งฝั่ง Anthropic ทำผ่าน tool-mode ที่ provider ตรงจัดการให้เอง
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    build: (apiKey, modelId) => createAnthropic({ apiKey })(modelId),
  },
  google: {
    envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    build: (apiKey, modelId) => createGoogleGenerativeAI({ apiKey })(modelId),
  },
  groq: {
    envKey: "GROQ_API_KEY",
    build: (apiKey, modelId) => createGroq({ apiKey })(modelId),
  },
  mistral: {
    envKey: "MISTRAL_API_KEY",
    build: (apiKey, modelId) => createMistral({ apiKey })(modelId),
  },
  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    build: (apiKey, modelId) =>
      createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      })(modelId),
  },
  tokenrouter: {
    envKey: "TOKENROUTER_API_KEY",
    build: (apiKey, modelId) =>
      createOpenAI({
        apiKey,
        baseURL: "https://api.tokenrouter.com/v1",
      })(modelId),
  },
};

export function providerNames(): string[] {
  return Object.keys(PROVIDERS);
}

// มี API key ของเจ้านี้ไหม — ใช้ข้าม agent ที่ยังไม่ได้ตั้ง key แทนที่จะให้ทั้งงานพัง
// ทำให้เพิ่มผู้เล่น AI ตัวใหม่ได้โดยไม่ต้องมี key ครบทุกเจ้าก่อน
export function hasApiKey(provider: string | null): boolean {
  if (!provider) return false;
  const entry = PROVIDERS[provider];
  return Boolean(entry && process.env[entry.envKey]);
}

function repairPredictionText(text: string): string | null {
  const outcome = text.match(/\b(HOME|DRAW|AWAY)\b/i)?.[1]?.toUpperCase();
  if (!outcome) return null;

  const reasoning = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#*_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);

  return JSON.stringify({ outcome, reasoning });
}

// เรียก LLM ให้ทายผล — API key อ่านจาก env เท่านั้น (ห้าม hardcode)
export async function llmPredict(
  provider: string,
  modelId: string,
  ctx: MatchContext,
  systemPrompt?: string | null,
  options?: { timeoutMs?: number; maxRetries?: number },
): Promise<LlmPredictionResult> {
  const entry = PROVIDERS[provider];
  if (!entry) {
    throw new Error(
      `ไม่รู้จัก provider '${provider}' (มีให้ใช้: ${providerNames().join(", ")})`,
    );
  }
  const apiKey = process.env[entry.envKey];
  if (!apiKey) {
    throw new Error(`Missing ${entry.envKey} ใน .env.local`);
  }
  const model = entry.build(apiKey, modelId);

  const prompt = buildPrompt(ctx);
  const startedAt = Date.now();

  // ต้องมี timeout เสมอ — ถ้าไม่ใส่ แล้ว request ค้าง (เน็ตมีปัญหา/ปลายทางไม่ตอบ) script จะค้าง
  // ตลอดกาลโดยไม่มี error ให้ดูเลย ซึ่ง debug ไม่ได้ ยอมให้มันล้มเร็ว ๆ พร้อมข้อความดีกว่า
  const { object } = await generateObject({
    model,
    schema: predictionSchema,
    system: systemPrompt || SYSTEM_PROMPT,
    prompt,
    abortSignal: AbortSignal.timeout(options?.timeoutMs ?? 60_000),
    repairText: async ({ text }) => repairPredictionText(text),
    // retry เยอะกว่า default (2) เพราะ free tier ของ Gemini เจอ 503 "high demand" บ่อยช่วงพีค
    // และ job นี้พลาดไม่ได้จริง ๆ — ถ้าทายไม่ทันก่อนคิกออฟคือเสียแมตช์เดย์นั้นถาวร ย้อนกลับไป
    // ทายใหม่ไม่ได้ (guarded upsert จะปฏิเสธ) AI SDK ใช้ exponential backoff ให้เองอยู่แล้ว
    maxRetries: options?.maxRetries ?? 5,
  });

  return {
    outcome: object.outcome,
    reasoning: object.reasoning,
    prompt,
    latencyMs: Date.now() - startedAt,
  };
}
