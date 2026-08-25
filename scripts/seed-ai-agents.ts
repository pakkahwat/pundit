import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// สร้าง user + ai_agents row สำหรับผู้เล่น AI — รันครั้งเดียวตอนตั้งโปรเจกต์ (idempotent เพราะเช็ค
// จาก ai_agents.agent_key ก่อน insert ทุกครั้ง — รันซ้ำได้ปลอดภัย ไม่สร้าง user ซ้ำ)
//
// ผู้เล่น AI: baseline (ไม่ใช้ LLM) + โมเดลจากหลายค่าย เพื่อตอบได้ทั้ง "AI vs คน" และ
// "โมเดลไหนแม่นที่สุด" — provider/model_id เก็บใน DB ไม่ได้ hardcode ในโค้ดที่ทายจริง
// เลยเปลี่ยนรุ่นทีหลังได้โดยแก้ไฟล์นี้แล้วรันซ้ำ
//
// ทุกตัวใช้ prompt เดียวกัน schema เดียวกัน และเห็น context ชุดเดียวกันเป๊ะ ๆ — ตัวแปรเดียว
// ที่ต่างกันคือโมเดล ถ้าเผลอปรับ prompt ให้ตัวใดตัวหนึ่งเป็นพิเศษ ผลเทียบทั้งฤดูกาลจะใช้ไม่ได้
// รันมือ: npm run db:seed-ai-agents

type AgentSeed = {
  agentKey: string;
  displayName: string;
  provider: string | null;
  modelId: string | null;
  strategy: string;
  systemPrompt: string | null;
};

const AGENTS: AgentSeed[] = [
  {
    agentKey: 'baseline-form',
    displayName: 'Baseline AI (วิเคราะห์ฟอร์ม)',
    provider: null,
    modelId: null,
    strategy: 'static_form_based',
    systemPrompt: null,
  },
  {
    agentKey: 'gemini-flash-lite',
    displayName: 'Gemini Flash Lite',
    provider: 'google',
    modelId: 'gemini-flash-lite-latest',
    strategy: 'llm',
    systemPrompt: null, // null = ใช้ SYSTEM_PROMPT กลางใน src/lib/ai/llm.ts
  },
  // หมายเหตุว่าทำไมเหลือ Gemini แค่รุ่นเดียว (ทดสอบจริงกับ key ฟรีแล้วทั้งคู่):
  //   gemini-pro-latest   -> free tier ให้โควตา 0 requests เลย ("limit: 0, model: gemini-3.1-pro")
  //                          ไม่ใช่แค่เต็ม แต่ไม่มีสิทธิ์ตั้งแต่แรก
  //   gemini-flash-latest -> มีสิทธิ์ แต่คิวแน่นจนตอบไม่ทัน (503 บ้าง timeout 60 วินาทีบ้าง)
  //                          ขณะที่ flash-lite บนเน็ตเส้นเดียวกันตอบปกติ
  // ถ้าวันหนึ่งเปิดบัญชีแบบเสียเงิน ค่อยเพิ่มสองตัวนั้นกลับเข้ามาที่ array นี้ได้เลย

  // ── ผู้เล่นจากค่ายอื่น ────────────────────────────────────────────────────
  // จงใจกระจายไปคนละผู้ให้บริการ ไม่กองที่ Gemini เจ้าเดียว เพราะโควตาฟรีของแต่ละเจ้า
  // แยกกัน ถ้าเจ้าหนึ่งล่มหรือโควตาหมด ตัวอื่นยังทายต่อได้ — และที่สำคัญกว่าคือ ถ้ากองอยู่
  // ค่ายเดียวกันหมด คำถาม "โมเดลไหนแม่นกว่า" จะตอบได้แค่ในวงแคบ
  //
  // ตัวไหนยังไม่ได้ตั้ง API key จะถูกข้ามเองตอนรันงาน (ดู hasApiKey ใน src/lib/ai/llm.ts)
  // ไม่ต้องมี key ครบทุกเจ้าก่อนถึงจะเริ่มใช้ได้
  // ── รุ่นบน Groq ────────────────────────────────────────────────────────────
  // ชื่อรุ่นที่เอกสารของ Groq ลิสต์ไว้ ไม่ใช่ชื่อที่คีย์ฟรีเรียกได้เสมอไป (llama-3.3-70b-versatile
  // อยู่ในเอกสารแต่เป็นระดับ Enterprise, llama-3.1-8b-instant ก็ไม่อยู่ในคีย์ฟรีที่ทดสอบ)
  // เช็คของจริงจากคีย์ตัวเองก่อนเสมอ: npm run db:list-models -- groq
  //
  // ⚠️ ห้ามใช้ groq/compound และ groq/compound-mini เป็นผู้เล่นเด็ดขาด
  // สองตัวนั้นเป็นระบบเอเจนต์ที่ค้นเว็บได้ในตัว ซึ่งแปลว่ามันอาจไปเปิดดูผลแข่งจริงมาตอบ
  // ทำลายกติกาข้อที่ 5 (AI เห็นเฉพาะข้อมูลก่อนคิกออฟ) และจะทำให้ตัวเลขความแม่นทั้งหมด
  // ไร้ความหมาย เพราะเราจะแยกไม่ออกว่ามันวิเคราะห์เก่งหรือแค่แอบดูเฉลย
  {
    agentKey: 'groq-gpt-oss',
    displayName: 'GPT-OSS 120B (Groq)',
    provider: 'groq',
    modelId: 'openai/gpt-oss-120b',
    strategy: 'llm',
    systemPrompt: null,
  },
  // ตัวที่สองจงใจเลือกตระกูลเดียวกับตัวบนแต่เล็กกว่า (120B vs 20B) — ได้คำตอบว่า "โมเดลใหญ่ขึ้น
  // ช่วยจริงไหมกับงานทายบอล" โดยคุมตัวแปรอื่นคงที่หมด ทั้ง prompt, context และผู้ให้บริการ
  //
  // เคยลอง qwen/qwen3.6-27b แล้วไม่ผ่าน: Groq ตอบ 400 json_validate_failed โดย failed_generation
  // ว่างเปล่า — น่าจะเป็นโมเดลสายคิดก่อนตอบที่พ่นข้อความคิดออกมาก่อน เลยชนกับโหมด JSON เข้มงวด
  {
    agentKey: 'groq-gpt-oss-20b',
    displayName: 'GPT-OSS 20B (Groq)',
    provider: 'groq',
    modelId: 'openai/gpt-oss-20b',
    strategy: 'llm',
    systemPrompt: null,
  },
  {
    agentKey: 'mistral-small',
    displayName: 'Mistral Small',
    provider: 'mistral',
    modelId: 'mistral-small-latest',
    strategy: 'llm',
    systemPrompt: null,
  },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing DATABASE_URL ใน .env.local');
  }
  const sql = postgres(connectionString, { prepare: false });

  try {
    for (const a of AGENTS) {
      const [existing] = await sql<{ id: string }[]>`
        select id from ai_agents where agent_key = ${a.agentKey}
      `;
      if (existing) {
        // อัปเดตค่าที่เปลี่ยนได้ (โดยเฉพาะ model_id) แทนการข้ามเฉย ๆ — ไม่งั้นพอเปลี่ยนรุ่นโมเดล
        // ในไฟล์นี้แล้วรันซ้ำ จะไม่มีผลอะไรเลย ต้องไปแก้มือใน DB เอง
        // ไม่แตะ user_id เพราะผูกกับคำทาย/คะแนนเดิมไว้แล้ว เปลี่ยนไม่ได้
        await sql`
          update ai_agents set
            display_name = ${a.displayName},
            provider = ${a.provider},
            model_id = ${a.modelId},
            strategy = ${a.strategy},
            system_prompt = ${a.systemPrompt},
            is_active = true
          where id = ${existing.id}
        `;
        console.log(`อัปเดต: ${a.agentKey} -> ${a.modelId ?? 'ไม่ใช้ LLM'}`);
        continue;
      }

      const [user] = await sql<{ id: string }[]>`
        insert into users (name, player_kind) values (${a.displayName}, 'ai') returning id
      `;
      await sql`
        insert into ai_agents (
          user_id, agent_key, display_name, provider, model_id, strategy, system_prompt
        )
        values (
          ${user.id}, ${a.agentKey}, ${a.displayName}, ${a.provider}, ${a.modelId},
          ${a.strategy}, ${a.systemPrompt}
        )
      `;
      console.log(`สร้างแล้ว: ${a.agentKey} (user ${user.id})`);
    }

    // ปิด agent ที่ไม่อยู่ในไฟล์นี้แล้ว (เช่น gemini-pro ที่ถอดออกเพราะ free tier ให้โควตา 0)
    // — ใช้ is_active = false ไม่ลบทิ้ง เพราะคำทายกับคะแนนที่มันเคยทำไว้ต้องคงอยู่เพื่อการวิเคราะห์
    // ทำให้ไฟล์นี้เป็นแหล่งความจริงเดียวของรายชื่อ agent ที่ active อยู่
    const activeKeys = AGENTS.map((a) => a.agentKey);
    const deactivated = await sql`
      update ai_agents set is_active = false
      where is_active = true and agent_key <> all(${activeKeys})
      returning agent_key
    `;
    for (const row of deactivated) {
      console.log(`ปิดใช้งาน: ${row.agent_key} (ไม่อยู่ในรายชื่อแล้ว)`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('Seed AI agents ล้มเหลว:', err);
  process.exit(1);
});
