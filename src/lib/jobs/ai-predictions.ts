import { sql as sqlTag } from "drizzle-orm";
import type postgres from "postgres";

import { db } from "@/db/client";
import { baselinePredict } from "@/lib/ai/baseline";
import {
  CONSECUTIVE_FAILURES_TO_TRIP,
  isCircuitTripped,
} from "@/lib/ai/circuit";
import { buildMatchContext, type MatchContext } from "@/lib/ai/context";
import { hasApiKey, llmPredict } from "@/lib/ai/llm";
import {
  formatBaselineLogPrompt,
  formatLlmLogPrompt,
} from "@/lib/ai/prediction-log";
import { guardedUpsertPrediction } from "@/lib/predictions/guarded-upsert";
import type { PredictionOutcome } from "@/lib/predictions/outcome";
import { getCurrentMatchdays } from "@/lib/matches/current-matchday";
import { withUserContextSql } from "@/db/rls";

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

// probe = ยิงหยั่งเชิงของ agent ที่วงจรตัด (ดู lib/ai/circuit.ts) — retry แค่ครั้งเดียว เพราะจุดประสงค์
// คือเช็คว่า "ยังพังอยู่ไหม" ด้วยราคาถูก แต่ยังเผื่อ 503 ชั่วคราวของ free tier ไว้หนึ่งจังหวะ
// (ถ้าไม่ retry เลย จังหวะแย่ครั้งเดียวจะทำให้ทั้งรอบของตัวนั้นถูกข้าม)
async function predictFor(
  agent: AgentRow,
  context: MatchContext,
  options: { probe: boolean },
) {
  if (agent.strategy === "static_form_based") {
    const { outcome, reasoning } = baselinePredict(context);
    return {
      outcome,
      prompt: formatBaselineLogPrompt({ outcome, reasoning }),
      reasoning,
      latencyMs: null as number | null,
    };
  }

  if (agent.strategy === "llm") {
    if (!agent.provider || !agent.model_id) {
      throw new Error(
        `agent ${agent.agent_key} เป็น strategy 'llm' แต่ไม่มี provider/model_id ใน DB`,
      );
    }
    // บีบ timeout ต่อ call ให้จบก่อนกำแพง 60 วิของ Vercel เสมอ — default 60 วิของ llmPredict
    // ทำให้ call ที่เริ่มวินาทีที่ 35 ลากถึงวินาทีที่ 95 ได้ ฟังก์ชันโดนฆ่ากลางทาง แถวใน
    // cron_runs เลยค้างเป็น 'running' ตลอดกาล (เห็นในหน้า admin มาแล้วจริง)
    // budget: เช็ค deadline ก่อนเริ่ม call ที่ ~35 วิ + call ยาวสุด 20 วิ = จบใน ~55 วิ
    const result = await llmPredict(
      agent.provider,
      agent.model_id,
      context,
      agent.system_prompt,
      { timeoutMs: 20_000, maxRetries: options.probe ? 1 : 2 },
    );
    return {
      outcome: result.outcome as PredictionOutcome,
      prompt: formatLlmLogPrompt({
        prompt: result.prompt,
        outcome: result.outcome,
        reasoning: result.reasoning,
      }),
      reasoning: result.reasoning,
      latencyMs: result.latencyMs as number | null,
    };
  }

  throw new Error(
    `ไม่รู้จัก strategy '${agent.strategy}' ของ agent ${agent.agent_key}`,
  );
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
  const usable = agents.filter(
    (a) => a.strategy !== "llm" || hasApiKey(a.provider),
  );
  const noKey = agents.filter((a) => !usable.includes(a));
  for (const a of noKey) {
    log(`ข้าม ${a.agent_key} — ยังไม่ได้ตั้ง API key ของ ${a.provider}`);
  }

  // วงจรตัดต่อ agent: ตัวที่พังติดกันหลายครั้งล่าสุดจะได้ยิงหยั่งเชิงแค่นัดเดียวในรอบนี้ แทนที่จะ
  // ไล่พังทุกนัดที่ค้าง (พร้อม retry) แล้วกินงบเวลาของตัวอื่นไปด้วย — เหตุผลเต็มใน lib/ai/circuit.ts
  // อ่านจาก ai_prediction_logs ซึ่งไม่อยู่ใต้ RLS จึงใช้ sql ตรง ๆ ได้
  const tripped = new Set<string>();
  for (const agent of usable) {
    const recent = await sql<{ parse_succeeded: boolean; match_id: string }[]>`
      select parse_succeeded, match_id from ai_prediction_logs
      where ai_agent_id = ${agent.id}
      order by created_at desc
      limit ${CONSECUTIVE_FAILURES_TO_TRIP}
    `;
    const attempts = recent.map((r) => ({
      succeeded: r.parse_succeeded,
      matchId: r.match_id,
    }));
    if (isCircuitTripped(attempts)) {
      tripped.add(agent.id);
      log(
        `${agent.agent_key}: พังติดกัน ${CONSECUTIVE_FAILURES_TO_TRIP} ครั้งล่าสุด — รอบนี้ยิงหยั่งเชิงแค่ 1 นัด`,
      );
    }
  }

  // ดึงเฉพาะคู่ (agent, match) ที่ยังไม่มีคำทาย — ทำใน SQL ทีเดียวแทนที่จะไล่เช็คใน JS
  // ทำให้รอบถัดไปของ cron หยิบเฉพาะงานที่เหลือจริง ๆ ขึ้นมาทำต่อได้ทันที
  //
  // จำกัดที่ "แมตช์เดย์ปัจจุบัน" ของแต่ละฤดูกาล โดยคำนวณเองจากโปรแกรมแข่ง ไม่ใช่อ่าน
  // seasons.current_matchday (ดู lib/matches/current-matchday.ts) — ถ้าเชื่อค่าจากผู้ให้บริการ
  // AI จะข้ามนัดที่ยังทายได้ของแมตช์เดย์ปัจจุบันไปทายแมตช์เดย์ถัดไปแทน กลายเป็นว่าคนทายแต่ AI ไม่ทาย
  const activeSeasons = await sql<
    { id: string }[]
  >`select id from seasons where is_active = true`;
  const matchdayBySeason = await getCurrentMatchdays(
    activeSeasons.map((s) => s.id),
    sql,
  );
  const seasonIds = [...matchdayBySeason.keys()];
  const matchdayValues = seasonIds.map((id) => matchdayBySeason.get(id)!);

  //
  // ถามทีละ agent ภายใต้ user context ของ agent ตัวนั้น ไม่ใช่ยิง query เดียวรวดเดียว —
  // RLS policy ของ predictions ซ่อนคำทายของนัดที่ยังไม่คิกออฟจากทุกคนที่ไม่ใช่เจ้าของคำทาย
  // ถ้าถามโดยไม่มี context เลย `not exists (...)` จะเป็นจริงเสมอ แปลว่า job จะคิดว่า "ยังไม่มีใครทาย"
  // ทุกครั้ง แล้วสั่ง LLM ทายซ้ำทุกนัดทุกรอบ cron — เผาโควตาฟรีทิ้งและทับคำทายเดิมไปเรื่อย ๆ
  // (จำนวน agent มีไม่กี่ตัว การยิงทีละตัวจึงถูกกว่าการเสีย LLM call มหาศาลมาก)
  const pending: { agent_id: string; match_id: string; ko: string }[] = [];
  if (seasonIds.length) {
    for (const agent of usable) {
      const rows = await withUserContextSql(
        sql,
        agent.user_id,
        (tx) =>
          tx<{ match_id: string; ko: string }[]>`
          select m.id as match_id, m.kickoff_at::text as ko
          from matches m
          join unnest(${seasonIds}::uuid[], ${matchdayValues}::int[]) as cur(season_id, matchday)
            on cur.season_id = m.season_id and cur.matchday = m.matchday
          where m.kickoff_at > now()
            and not exists (
              select 1 from predictions p
              where p.user_id = ${agent.user_id}::uuid and p.match_id = m.id
            )
        `,
      );
      for (const r of rows)
        pending.push({ agent_id: agent.id, match_id: r.match_id, ko: r.ko });
    }
    // เรียงตามเวลาคิกออฟเหมือนเดิม เพื่อให้นัดที่ใกล้ปิดรับที่สุดได้ทายก่อนถ้าทำไม่ทันในรอบเดียว
    pending.sort(
      (a, b) =>
        a.ko.localeCompare(b.ko) || a.agent_id.localeCompare(b.agent_id),
    );
  }

  const agentById = new Map(usable.map((a) => [a.id, a]));
  log(`เหลือให้ทาย ${pending.length} รายการ (agent x แมตช์)`);

  let processed = 0;
  let failed = 0;
  let skippedByCircuit = 0;
  const lastCallAt = new Map<string, number>();
  // agent ที่หยั่งเชิงแล้วยังพัง — นัดที่เหลือของตัวนั้นในรอบนี้ข้ามเลย ไม่เรียก LLM ไม่บันทึก log
  const probeFailed = new Set<string>();

  for (const item of pending) {
    const agent = agentById.get(item.agent_id);
    if (!agent) continue;

    if (probeFailed.has(agent.id)) {
      skippedByCircuit++;
      continue;
    }

    // เผื่อเวลาไว้ 1 รอบก่อนถึง deadline — หยุดก่อนโดนตัดกลางคัน จะได้บันทึก cron_runs ทัน
    if (Date.now() - startedAt > deadlineMs - LLM_DELAY_MS - 15_000) {
      log("ใกล้หมดเวลาของรอบนี้ หยุดไว้ก่อน ให้ cron รอบถัดไปทำต่อ");
      break;
    }

    const context = await buildMatchContext(sql, item.match_id);
    const isLlm = agent.strategy === "llm";
    const probe = tripped.has(agent.id);
    // แยก "LLM ตอบมาแล้ว" ออกจาก "ขั้นเขียน DB ล้ม" — ถ้าโมเดลตอบได้แต่ transaction พัง
    // นั่นไม่ใช่สัญญาณว่าโมเดลล่ม ห้ามเอาไปตัดสินหยั่งเชิงว่าไม่ผ่านแล้วข้ามนัดที่เหลือของตัวนั้น
    let llmAnswered = false;

    try {
      if (isLlm && agent.provider) {
        const since = Date.now() - (lastCallAt.get(agent.provider) ?? 0);
        if (since < LLM_DELAY_MS) await sleep(LLM_DELAY_MS - since);
        lastCallAt.set(agent.provider, Date.now());
      }

      const { outcome, prompt, reasoning, latencyMs } = await predictFor(
        agent,
        context,
        { probe },
      );
      llmAnswered = true;
      if (probe) {
        // สำเร็จครั้งเดียวก็พอ — ปลดวงจรแล้วทายนัดที่เหลือต่อในรอบนี้เลย ไม่ต้องรอรอบถัดไป
        tripped.delete(agent.id);
        log(`  ${agent.agent_key}: หยั่งเชิงสำเร็จ กลับมาทายเต็มรูปแบบ`);
      }

      const rows = await db.transaction(async (tx) => {
        await tx.execute(
          sqlTag`select set_config('app.current_user_id', ${agent.user_id}, true)`,
        );
        return guardedUpsertPrediction(
          tx,
          agent.user_id,
          item.match_id,
          outcome,
        );
      });
      const predictionId = rows[0]?.id ?? null;

      await sql`
        insert into ai_prediction_logs (
          ai_agent_id, match_id, prediction_id, model_id, context_snapshot, prompt,
          reasoning, latency_ms, parse_succeeded
        )
        values (
          ${agent.id}, ${item.match_id}, ${predictionId}, ${agent.model_id},
          ${JSON.stringify(context)}::jsonb, ${prompt}, ${reasoning}, ${latencyMs}, true
        )
      `;
      processed++;
      log(
        `  ${agent.agent_key}: ${context.homeTeam} vs ${context.awayTeam} -> ${outcome}` +
          (latencyMs ? ` (${latencyMs}ms)` : ""),
      );
    } catch (err) {
      failed++;
      log(
        `  ${agent.agent_key}: แมตช์ ${item.match_id} ล้มเหลว — ${String(err)}`,
      );
      if (probe && !llmAnswered) {
        probeFailed.add(agent.id);
        log(
          `  ${agent.agent_key}: หยั่งเชิงไม่ผ่าน ข้ามนัดที่เหลือของตัวนี้ในรอบนี้`,
        );
      }
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

  if (skippedByCircuit > 0) {
    log(
      `ข้าม ${skippedByCircuit} รายการของ agent ที่วงจรตัด (จะลองใหม่รอบถัดไป)`,
    );
  }

  // remaining นับรวมรายการที่ข้ามด้วย — มันยังค้างอยู่จริงและรอบถัดไปจะหยิบมาหยั่งเชิงใหม่
  return {
    processed,
    failed,
    skipped: skippedByCircuit,
    remaining: pending.length - processed - failed,
  };
}
