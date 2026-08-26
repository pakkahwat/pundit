import { sql as sqlTag } from 'drizzle-orm';
import type postgres from 'postgres';

import { db } from '@/db/client';
import { baselinePredict } from '@/lib/ai/baseline';
import { buildMatchContext, type MatchContext } from '@/lib/ai/context';
import { hasApiKey, llmPredict } from '@/lib/ai/llm';
import { guardedUpsertPrediction } from '@/lib/predictions/guarded-upsert';
import type { PredictionOutcome } from '@/lib/predictions/outcome';
import { getCurrentMatchdays } from '@/lib/matches/current-matchday';

// Gemini Flash Lite บน free tier ได้ราว 15 requests/นาที (= 1 ครั้งต่อ 4 วินาที) — เว้น 5 วินาที
// เผื่อไว้ ดีกว่าโดน 429 แล้วต้องมาไล่ retry เอง
const LLM_DELAY_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type AgentRow = {
  id: string;
  user_id: string;
  agent_key: string;
  strategy: string;
  provider: string | null;
  model_id: string | null;
  system_prompt: string | null;
};

async function predictFor(agent: AgentRow, context: MatchContext) {
  if (agent.strategy === 'static_form_based') {
    const { outcome, reasoning } = baselinePredict(context);
    return {
      outcome,
      prompt: `baseline (deterministic ไม่มี LLM) -> ${outcome}: ${reasoning}`,
      latencyMs: null as number | null,
    };
  }

  if (agent.strategy === 'llm') {
    if (!agent.provider || !agent.model_id) {
      throw new Error(`agent ${agent.agent_key} เป็น strategy 'llm' แต่ไม่มี provider/model_id ใน DB`);
    }
    const result = await llmPredict(agent.provider, agent.model_id, context, agent.system_prompt);
    return {
      outcome: result.outcome as PredictionOutcome,
      prompt: `${result.prompt}\n\n--- โมเดลตอบ ---\n${result.outcome}: ${result.reasoning}`,
      latencyMs: result.latencyMs as number | null,
    };
  }

  throw new Error(`ไม่รู้จัก strategy '${agent.strategy}' ของ agent ${agent.agent_key}`);
}

// ให้ AI ทายผลแมตช์ที่ยังไม่ล็อกและ "ยังไม่เคยทาย" — เขียนผ่าน guardedUpsertPrediction เส้นทาง
// เดียวกับที่มนุษย์ใช้ทุกตัวอักษร เพื่อรับประกัน structurally ว่า AI ไม่ได้ deadline พิเศษ
// (requirement ข้อ 5) และ context ที่เห็นก็กรองด้วย kickoff_at ของแมตช์เป้าหมายเสมอ
//
// deadlineMs: บน Vercel ฟังก์ชันมีเพดานเวลา (Hobby 60 วินาที) ถ้าทายไม่ครบในรอบเดียวก็หยุดแล้ว
// รายงานว่าเหลือกี่นัด แล้วให้ cron รอบถัดไปมาทำต่อ — ทำได้เพราะงานนี้ idempotent อยู่แล้วและ
// เราข้ามนัดที่ทายไปแล้ว จึงไม่มีทางทำงานซ้ำหรือเสียโควตา LLM ฟรีไปเปล่า ๆ
export async function runAiPredictions(
  sql: postgres.Sql,
  options: { deadlineMs?: number; onLog?: (msg: string) => void } = {},
) {
  const startedAt = Date.now();
  const deadlineMs = options.deadlineMs ?? Number.POSITIVE_INFINITY;
  const log = options.onLog ?? (() => {});

  const agents = await sql<AgentRow[]>`
    select id, user_id, agent_key, strategy, provider, model_id, system_prompt
    from ai_agents where is_active = true
    order by agent_key
  `;

  // ข้าม agent ที่ยังไม่ได้ตั้ง API key ของ provider นั้น — ไม่ใช่ error เพราะการเพิ่มผู้เล่น AI
  // ตัวใหม่เข้า seed แล้วยังไม่ได้สมัคร key เป็นเรื่องปกติ ปล่อยให้ตัวที่พร้อมทำงานต่อไป
  const usable = agents.filter((a) => a.strategy !== 'llm' || hasApiKey(a.provider));
  const skipped = agents.filter((a) => !usable.includes(a));
  for (const a of skipped) {
    log(`ข้าม ${a.agent_key} — ยังไม่ได้ตั้ง API key ของ ${a.provider}`);
  }

  // ดึงเฉพาะคู่ (agent, match) ที่ยังไม่มีคำทาย — ทำใน SQL ทีเดียวแทนที่จะไล่เช็คใน JS
  // ทำให้รอบถัดไปของ cron หยิบเฉพาะงานที่เหลือจริง ๆ ขึ้นมาทำต่อได้ทันที
  //
  // จำกัดที่ "แมตช์เดย์ปัจจุบัน" ของแต่ละฤดูกาล โดยคำนวณเองจากโปรแกรมแข่ง ไม่ใช่อ่าน
  // seasons.current_matchday (ดู lib/matches/current-matchday.ts) — ถ้าเชื่อค่าจากผู้ให้บริการ
  // AI จะข้ามนัดที่ยังทายได้ของแมตช์เดย์ปัจจุบันไปทายแมตช์เดย์ถัดไปแทน กลายเป็นว่าคนทายแต่ AI ไม่ทาย
  const activeSeasons = await sql<{ id: string }[]>`select id from seasons where is_active = true`;
  const matchdayBySeason = await getCurrentMatchdays(
    activeSeasons.map((s) => s.id),
    sql,
  );
  const seasonIds = [...matchdayBySeason.keys()];
  const matchdayValues = seasonIds.map((id) => matchdayBySeason.get(id)!);

  const pending = seasonIds.length
    ? await sql<{ agent_id: string; match_id: string }[]>`
        select a.id as agent_id, m.id as match_id
        from ai_agents a
        cross join matches m
        join unnest(${seasonIds}::uuid[], ${matchdayValues}::int[]) as cur(season_id, matchday)
          on cur.season_id = m.season_id and cur.matchday = m.matchday
        where a.is_active = true
          and m.kickoff_at > now()
          and not exists (
            select 1 from predictions p where p.user_id = a.user_id and p.match_id = m.id
          )
        order by m.kickoff_at, a.id
      `
    : [];

  const agentById = new Map(usable.map((a) => [a.id, a]));
  log(`เหลือให้ทาย ${pending.length} รายการ (agent x แมตช์)`);

  let processed = 0;
  let failed = 0;
  const lastCallAt = new Map<string, number>();

  for (const item of pending) {
    const agent = agentById.get(item.agent_id);
    if (!agent) continue;

    // เผื่อเวลาไว้ 1 รอบก่อนถึง deadline — หยุดก่อนโดนตัดกลางคัน จะได้บันทึก cron_runs ทัน
    if (Date.now() - startedAt > deadlineMs - LLM_DELAY_MS - 15_000) {
      log('ใกล้หมดเวลาของรอบนี้ หยุดไว้ก่อน ให้ cron รอบถัดไปทำต่อ');
      break;
    }

    const context = await buildMatchContext(sql, item.match_id);
    const isLlm = agent.strategy === 'llm';

    try {
      if (isLlm && agent.provider) {
        const since = Date.now() - (lastCallAt.get(agent.provider) ?? 0);
        if (since < LLM_DELAY_MS) await sleep(LLM_DELAY_MS - since);
        lastCallAt.set(agent.provider, Date.now());
      }

      const { outcome, prompt, latencyMs } = await predictFor(agent, context);

      const rows = await db.transaction(async (tx) => {
        await tx.execute(sqlTag`select set_config('app.current_user_id', ${agent.user_id}, true)`);
        return guardedUpsertPrediction(tx, agent.user_id, item.match_id, outcome);
      });
      const predictionId = rows[0]?.id ?? null;

      await sql`
        insert into ai_prediction_logs (
          ai_agent_id, match_id, prediction_id, model_id, context_snapshot, prompt,
          latency_ms, parse_succeeded
        )
        values (
          ${agent.id}, ${item.match_id}, ${predictionId}, ${agent.model_id},
          ${JSON.stringify(context)}::jsonb, ${prompt}, ${latencyMs}, true
        )
      `;
      processed++;
      log(
        `  ${agent.agent_key}: ${context.homeTeam} vs ${context.awayTeam} -> ${outcome}` +
          (latencyMs ? ` (${latencyMs}ms)` : ''),
      );
    } catch (err) {
      failed++;
      log(`  ${agent.agent_key}: แมตช์ ${item.match_id} ล้มเหลว — ${String(err)}`);
      // เก็บ error ไว้เพื่อแยก "ทายผิด" ออกจาก "ไม่ได้ทายเพราะระบบพัง" — สำคัญกับคำถามวิจัย
      await sql`
        insert into ai_prediction_logs (
          ai_agent_id, match_id, model_id, context_snapshot, prompt, parse_succeeded, error
        )
        values (
          ${agent.id}, ${item.match_id}, ${agent.model_id}, ${JSON.stringify(context)}::jsonb,
          '', false, ${String(err)}
        )
      `;
    }
  }

  return { processed, failed, remaining: pending.length - processed - failed };
}
