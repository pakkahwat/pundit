import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// สร้าง user + ai_agents row สำหรับผู้เล่น AI — รันครั้งเดียวตอนตั้งโปรเจกต์ (idempotent เพราะเช็ค
// จาก ai_agents.agent_key ก่อน insert ทุกครั้ง — รันซ้ำได้ปลอดภัย ไม่สร้าง user ซ้ำ)
//
// ผู้เล่น AI 3 ตัว: baseline (ไม่ใช้ LLM) + Gemini 2 รุ่น (Flash กับ Pro) เพื่อเทียบได้ทั้ง
// "AI vs คน" และ "รุ่นเล็ก vs รุ่นใหญ่ของค่ายเดียวกัน" — model_id เก็บใน DB ไม่ได้ hardcode ในโค้ด
// เลยเปลี่ยนรุ่นทีหลังได้โดยแก้แถวใน DB อย่างเดียว
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
