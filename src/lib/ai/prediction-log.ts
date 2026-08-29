import type { PredictionOutcome } from "@/lib/predictions/outcome";

// รูปแบบของคอลัมน์ ai_prediction_logs.prompt — เขียนไว้ที่เดียวเพราะมีสองฝั่งที่ต้องตรงกันเป๊ะ:
// ฝั่งที่ "เขียน" ตอน AI ทาย (lib/jobs/ai-predictions.ts) กับฝั่งที่ "อ่านย้อนกลับ" ตอน backfill
// (scripts/backfill-ai-reasoning.ts) ถ้าสองอันนี้หลุดจากกันเมื่อไหร่ backfill จะเงียบ ๆ แล้วไม่ได้อะไรเลย

export const MODEL_ANSWER_MARKER = "--- โมเดลตอบ ---";
export const BASELINE_PROMPT_PREFIX = "baseline (deterministic ไม่มี LLM) -> ";

/** prompt ที่เก็บลง log ของ agent ที่เรียก LLM จริง — เก็บทั้งสิ่งที่ส่งไปและสิ่งที่โมเดลตอบกลับมา */
export function formatLlmLogPrompt(args: {
  prompt: string;
  outcome: PredictionOutcome;
  reasoning: string;
}): string {
  return `${args.prompt}\n\n${MODEL_ANSWER_MARKER}\n${args.outcome}: ${args.reasoning}`;
}

/** prompt ที่เก็บลง log ของ baseline ซึ่งไม่ได้เรียก LLM เลย */
export function formatBaselineLogPrompt(args: {
  outcome: PredictionOutcome;
  reasoning: string;
}): string {
  return `${BASELINE_PROMPT_PREFIX}${args.outcome}: ${args.reasoning}`;
}

/**
 * ดึงเหตุผลกลับออกมาจากคอลัมน์ prompt
 *
 * ใช้กับแถวเก่าที่เขียนไว้ก่อนจะมีคอลัมน์ reasoning (migrate-ai-reasoning รันวันที่ 26 ส.ค.)
 * ข้อความยังอยู่ครบใน prompt อยู่แล้ว แค่ไม่เคยถูกแยกออกมาเก็บเป็นคอลัมน์ของตัวเอง
 * คืน null เมื่อรูปแบบไม่ตรง — ผู้เรียกควรข้ามแถวนั้นไปเฉย ๆ ไม่ใช่เขียนค่าเดาลงไป
 */
export function extractReasoningFromLogPrompt(
  prompt: string | null,
): string | null {
  if (!prompt) return null;

  const markerAt = prompt.lastIndexOf(MODEL_ANSWER_MARKER);
  const raw =
    markerAt >= 0
      ? prompt.slice(markerAt + MODEL_ANSWER_MARKER.length)
      : prompt.startsWith(BASELINE_PROMPT_PREFIX)
        ? prompt.slice(BASELINE_PROMPT_PREFIX.length)
        : null;
  if (raw === null) return null;

  // ตัดหัว "HOME: " / "DRAW: " / "AWAY: " ออก เหลือเฉพาะเหตุผลล้วน ๆ
  const reasoning = raw.trim().replace(/^(HOME|DRAW|AWAY)\s*:\s*/i, "").trim();
  return reasoning.length > 0 ? reasoning : null;
}
