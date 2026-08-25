import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../.env.local') });

// ลบผู้เล่น AI ที่เพิ่มเข้ามาผิดหรือใช้ไม่ได้ ออกจากระบบให้หมดจด
//
// ทำไมต้องมีสคริปต์แยก แทนที่จะลบมือใน Drizzle Studio: ผู้เล่น AI หนึ่งตัวมีข้อมูลผูกกันอยู่
// 3 ที่ (users, ai_agents, ai_prediction_logs) และอาจมี predictions/prediction_scores ด้วย
// ลบผิดลำดับหรือลบไม่ครบจะเหลือ user ลอยที่ยังโผล่ในตารางความแม่นทั้งที่ไม่มีตัวตนแล้ว
//
// กันพลาดสำคัญ: ถ้า agent ตัวนั้น "เคยทายจริง" จะไม่ยอมลบ เพราะการลบจะ cascade ไปลบคำทาย
// และคะแนนที่คิดไปแล้วด้วย ซึ่งทำให้สถิติทั้งฤดูกาลเพี้ยนย้อนหลัง — กรณีนั้นให้ปิดใช้งานแทน
// (เอา agentKey ออกจาก scripts/seed-ai-agents.ts แล้วรัน npm run db:seed-ai-agents)
//
// รัน: npm run db:remove-ai-agent -- <agent-key>
async function main() {
  const agentKey = process.argv[2];
  if (!agentKey) {
    console.error('ใช้: npm run db:remove-ai-agent -- <agent-key>');
    console.error('ดูรายชื่อ agent ทั้งหมดได้จาก npm run db:studio (ตาราง ai_agents)');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing DATABASE_URL ใน .env.local');
  const sql = postgres(connectionString, { prepare: false });

  try {
    const [agent] = await sql<{ id: string; user_id: string; display_name: string }[]>`
      select id, user_id, display_name from ai_agents where agent_key = ${agentKey}
    `;
    if (!agent) {
      console.log(`ไม่พบ agent '${agentKey}' — อาจถูกลบไปแล้ว`);
      return;
    }

    const [{ count: predictionCount }] = await sql<{ count: number }[]>`
      select count(*)::int as count from predictions where user_id = ${agent.user_id}
    `;
    const [{ count: logCount }] = await sql<{ count: number }[]>`
      select count(*)::int as count from ai_prediction_logs where ai_agent_id = ${agent.id}
    `;

    console.log(`${agent.display_name} (${agentKey})`);
    console.log(`  คำทายที่เคยบันทึกไว้: ${predictionCount}`);
    console.log(`  log การเรียกโมเดล:   ${logCount}`);

    if (predictionCount > 0) {
      console.error(
        `\nไม่ลบให้ — agent นี้เคยทายจริงไปแล้ว ${predictionCount} ครั้ง` +
          `\nการลบจะพาคำทายและคะแนนที่คิดไปแล้วหายไปด้วย ทำให้สถิติย้อนหลังเพี้ยน` +
          `\n\nถ้าแค่อยากให้หยุดทาย: เอา '${agentKey}' ออกจาก scripts/seed-ai-agents.ts` +
          `\nแล้วรัน npm run db:seed-ai-agents — มันจะตั้ง is_active = false ให้เอง`,
      );
      process.exitCode = 1;
      return;
    }

    // ลบจากลูกไปหาแม่: log -> ai_agents -> users
    // (ai_prediction_logs ไม่ได้ตั้ง on delete cascade ไว้ จึงต้องลบเองก่อน)
    await sql`delete from ai_prediction_logs where ai_agent_id = ${agent.id}`;
    await sql`delete from ai_agents where id = ${agent.id}`;
    await sql`delete from users where id = ${agent.user_id}`;

    console.log(`\nลบ ${agentKey} ออกเรียบร้อย (พร้อม log ${logCount} รายการ)`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('ลบ agent ล้มเหลว:', err);
  process.exit(1);
});
