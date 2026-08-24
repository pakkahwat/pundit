import './lib/prefer-ipv4'; // ต้องมาก่อน import อื่นที่ใช้เน็ต (ดูเหตุผลในไฟล์นั้น)

import { config } from 'dotenv';
import path from 'node:path';

import { llmPredict } from '../src/lib/ai/llm';
import type { MatchContext } from '../src/lib/ai/context';

config({ path: path.resolve(__dirname, '../.env.local') });

// เทสว่าต่อ Gemini ติดและ structured output ทำงานถูก โดยไม่ต้องแตะ DB เลย — ใช้ context ปลอม
// ที่แต่งขึ้นมาเอง เพื่อแยกปัญหา "ต่อ LLM ไม่ได้" ออกจาก "ข้อมูลใน DB ไม่พร้อม" ให้ชัด
// ใช้: npx tsx scripts/test-llm.ts [model-id]

const f = (results: string, opponent: string) =>
  results.split('').map((r) => ({
    matchId: '00000000-0000-0000-0000-000000000000',
    kickoffAt: '2026-08-01T00:00:00Z',
    opponent,
    isHome: true,
    goalsFor: r === 'W' ? 2 : r === 'D' ? 1 : 0,
    goalsAgainst: r === 'W' ? 0 : r === 'D' ? 1 : 2,
    result: r as 'W' | 'D' | 'L',
  }));

const fakeContext: MatchContext = {
  matchId: '00000000-0000-0000-0000-000000000000',
  kickoffAt: '2026-08-30T14:00:00Z',
  homeTeam: 'Arsenal FC',
  awayTeam: 'Burnley FC',
  homeForm: f('WWWDW', 'ทีมสมมติ'),
  awayForm: f('LLDLL', 'ทีมสมมติ'),
  headToHead: f('WWDWW', 'Burnley FC'),
  standings: [
    { team: 'Arsenal FC', played: 5, points: 13, goalsFor: 11, goalsAgainst: 3, goalDiff: 8 },
    { team: 'Burnley FC', played: 5, points: 2, goalsFor: 3, goalsAgainst: 12, goalDiff: -9 },
  ],
};

async function main() {
  const modelId = process.argv[2] ?? 'gemini-flash-latest';

  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    console.error('ไม่เจอ GOOGLE_GENERATIVE_AI_API_KEY ใน .env.local');
    process.exit(1);
  }
  // โชว์แค่หัวกับท้ายของ key พอให้ยืนยันว่าอ่านค่าถูกตัว — ไม่ปริ้นท์เต็มลง terminal/log
  console.log(`key: ${key.slice(0, 6)}...${key.slice(-4)} (ยาว ${key.length} ตัวอักษร)`);
  console.log(`เรียก ${modelId} (timeout 60 วินาที, retry ได้ 3 ครั้ง)...`);

  // เปิด retry ไว้พอประมาณ เพราะ free tier เจอ 503 "high demand" ชั่วคราวได้บ่อย — แต่ไม่เยอะ
  // เท่าตอนรันจริง (5 ครั้ง) เพราะตอนเทสอยากรู้ผลเร็ว ถ้าล้มก็ยังเห็นรายละเอียด error เต็ม ๆ อยู่ดี
  const result = await llmPredict(modelId, fakeContext, null, {
    timeoutMs: 60_000,
    maxRetries: 3,
  });

  console.log(`\nผลลัพธ์: ${result.outcome}`);
  console.log(`เหตุผล: ${result.reasoning}`);
  console.log(`ใช้เวลา: ${result.latencyMs}ms`);
  console.log(
    `\n(เคสนี้ Arsenal ฟอร์มดีกว่าชัดเจนและเป็นเจ้าบ้าน — ถ้าโมเดลตอบ HOME แปลว่าทำงานปกติ)`,
  );
}

// error ของ AI SDK ห่อรายละเอียดที่ต้องใช้ debug ไว้ในฟิลด์ย่อย (statusCode, responseBody) ซึ่ง
// console.error ตัวมันเองไม่โชว์ให้ — แกะออกมาปริ้นท์เองเพื่อให้รู้ว่าโดนปฏิเสธเพราะอะไรจริง ๆ
main().catch((err: unknown) => {
  console.error('\nเทส LLM ล้มเหลว');
  const e = err as {
    name?: string;
    message?: string;
    statusCode?: number;
    responseBody?: string;
    url?: string;
    cause?: unknown;
  };
  if (e.name) console.error(`  ชนิด: ${e.name}`);
  if (e.message) console.error(`  ข้อความ: ${e.message}`);
  if (e.statusCode) console.error(`  HTTP status: ${e.statusCode}`);
  if (e.url) console.error(`  URL: ${e.url}`);
  if (e.responseBody) console.error(`  คำตอบจากเซิร์ฟเวอร์: ${e.responseBody}`);
  if (e.cause) console.error(`  สาเหตุเบื้องหลัง: ${String(e.cause)}`);

  if (e.name === 'TimeoutError' || String(e.message).includes('aborted')) {
    console.error(
      '\n  => ครบเวลาแล้วปลายทางยังไม่ตอบเลย มักแปลว่าต่อออกเน็ตไม่ได้ (proxy/firewall/IPv6 เสีย)',
    );
  } else if (e.statusCode === 503) {
    console.error(
      '\n  => 503 คือฝั่ง Google รับ request ไม่ไหวชั่วคราว (free tier ช่วงพีค) ไม่ใช่ปัญหาโค้ดหรือ key\n' +
        '     รอสักครู่แล้วลองใหม่ หรือลองรุ่นอื่น: npm run test:llm gemini-flash-lite-latest',
    );
  } else if (e.statusCode === 429) {
    console.error('\n  => 429 คือเกินโควตา rate limit ของ free tier — รอสักครู่แล้วลองใหม่');
  } else if (e.statusCode === 401 || e.statusCode === 403) {
    console.error('\n  => API key ใช้ไม่ได้ ตรวจ GOOGLE_GENERATIVE_AI_API_KEY ใน .env.local');
  }
  process.exit(1);
});
