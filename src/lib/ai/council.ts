import {
  PREDICTION_OUTCOMES,
  type PredictionOutcome,
} from "../predictions/outcome";
import type { OutcomeProbabilities } from "./probabilities";

// ── สภา AI: ผู้เล่นที่ทายตามเสียงข้างมากของ AI ตัวอื่น ────────────────────────────
//
// ไม่เรียก LLM เลย — เอาคำทายของ AI ทุกตัวที่ทายนัดนั้นไปแล้วมานับโหวต ตอบคำถามว่า
// "รวมหัวกันแล้วแม่นกว่าตัวเดียวไหม" (ensemble) ซึ่งเป็นคำถามคลาสสิกของการเปรียบเทียบโมเดล
//
// กติกาความยุติธรรม: สภาเขียนคำทายผ่าน guardedUpsertPrediction เหมือนทุกคน จึงถูกล็อกตอน
// คิกออฟเท่ากัน และมันอ่านคำทายของ AI ตัวอื่นได้ก่อนคิกออฟก็เพราะ job อ่านภายใต้ user context
// ของเจ้าของคำทายแต่ละตัว (RLS อนุญาต "เห็นของตัวเอง") ไม่ได้เจาะ RLS — คนทั่วไปยังเห็นไม่ได้
//
// ตัดสินเสมอ: ถ้าจำนวนโหวตเท่ากัน ใช้ผลรวมความน่าจะเป็น (%) ที่แต่ละตัวให้ไว้เป็นตัวชี้ขาด
// (ตัวที่มั่นใจมากมีน้ำหนักมากกว่า) ถ้ายังเท่ากันอีกให้ HOME > DRAW > AWAY ตามความได้เปรียบเจ้าบ้าน

export const COUNCIL_STRATEGY = "council";

// ถ้ายังไม่ครบทุกตัวแต่ใกล้คิกออฟแล้ว ให้โหวตด้วยเสียงเท่าที่มี (อย่างน้อย 2) ดีกว่าไม่ได้ทายเลย —
// 3 ชั่วโมงกว้างพอให้ cron (ทุก 15 นาที) มาเก็บตกได้หลายรอบ
export const COUNCIL_NEAR_KICKOFF_MS = 3 * 60 * 60 * 1000;
export const COUNCIL_MIN_VOTES_NEAR_KICKOFF = 2;

export type CouncilVote = {
  agentKey: string;
  displayName: string;
  outcome: PredictionOutcome;
  probabilities: OutcomeProbabilities | null;
};

export type CouncilDecision = {
  outcome: PredictionOutcome;
  reasoning: string;
  probabilities: OutcomeProbabilities;
  counts: Record<PredictionOutcome, number>;
  tieBrokenBy: "probabilities" | "home-advantage" | null;
};

/**
 * สภาควรลงมติตอนนี้ไหม — รอให้ทุกตัวที่ยังทำงานได้ทายก่อน เว้นแต่ใกล้คิกออฟแล้ว
 * (required = จำนวน AI ที่คาดว่าจะทายได้ในรอบนี้ ไม่นับตัวที่วงจรตัด/ไม่มี key)
 */
export function councilShouldVote(args: {
  votes: number;
  required: number;
  msToKickoff: number;
}): boolean {
  if (args.votes <= 0) return false;
  if (args.votes >= args.required) return true;
  return (
    args.msToKickoff <= COUNCIL_NEAR_KICKOFF_MS &&
    args.votes >= COUNCIL_MIN_VOTES_NEAR_KICKOFF
  );
}

const ORDER: PredictionOutcome[] = ["HOME", "DRAW", "AWAY"];

export function tallyCouncil(votes: CouncilVote[]): CouncilDecision | null {
  if (votes.length === 0) return null;

  const counts: Record<PredictionOutcome, number> = { HOME: 0, DRAW: 0, AWAY: 0 };
  const probSum: Record<PredictionOutcome, number> = { HOME: 0, DRAW: 0, AWAY: 0 };
  for (const v of votes) {
    counts[v.outcome]++;
    if (v.probabilities) {
      for (const o of PREDICTION_OUTCOMES) probSum[o] += v.probabilities[o];
    }
  }

  const top = Math.max(...ORDER.map((o) => counts[o]));
  const leaders = ORDER.filter((o) => counts[o] === top);

  let outcome: PredictionOutcome;
  let tieBrokenBy: CouncilDecision["tieBrokenBy"] = null;
  if (leaders.length === 1) {
    outcome = leaders[0];
  } else {
    const topProb = Math.max(...leaders.map((o) => probSum[o]));
    const byProb = leaders.filter((o) => probSum[o] === topProb);
    if (byProb.length === 1 && topProb > 0) {
      outcome = byProb[0];
      tieBrokenBy = "probabilities";
    } else {
      // ORDER เรียง HOME > DRAW > AWAY อยู่แล้ว
      outcome = leaders[0];
      tieBrokenBy = "home-advantage";
    }
  }

  // ความน่าจะเป็นของสภา = สัดส่วนเสียงโหวตแบบ Laplace smoothing (บวก 1 ให้ทุกผลก่อนหาร)
  // ไม่ใช่สัดส่วนดิบ — 3 เสียงเอกฉันท์ไม่ได้แปลว่ามั่นใจ 100% (ทดสอบจริงเห็น "มั่นใจ 100%" ทั้งแมตช์เดย์
  // ซึ่งจะโดน Brier ลงโทษหนักตอนพลาด) สูตรนี้ให้ 3-0-0 = 67% และยิ่งมีเสียงมากยิ่งเข้าใกล้สัดส่วนจริง
  // ปัดให้รวม 100 โดยโยนเศษให้ผลที่ชนะ
  const total = votes.length;
  const probabilities: OutcomeProbabilities = { HOME: 0, DRAW: 0, AWAY: 0 };
  for (const o of ORDER) {
    probabilities[o] = Math.round(((counts[o] + 1) / (total + ORDER.length)) * 100);
  }
  probabilities[outcome] += 100 - (probabilities.HOME + probabilities.DRAW + probabilities.AWAY);

  const label: Record<PredictionOutcome, string> = {
    HOME: "เหย้า",
    DRAW: "เสมอ",
    AWAY: "เยือน",
  };
  const breakdown = ORDER.filter((o) => counts[o] > 0)
    .map((o) => {
      const names = votes
        .filter((v) => v.outcome === o)
        .map((v) => v.displayName)
        .join(", ");
      return `${label[o]} ${counts[o]} (${names})`;
    })
    .join(" · ");
  const tieNote =
    tieBrokenBy === "probabilities"
      ? " — เสียงเท่ากัน ตัดสินด้วยผลรวมความมั่นใจ"
      : tieBrokenBy === "home-advantage"
        ? " — เสียงเท่ากันและความมั่นใจเท่ากัน ให้เจ้าบ้าน"
        : "";

  return {
    outcome,
    reasoning: `โหวต ${total} เสียง: ${breakdown}${tieNote}`,
    probabilities,
    counts,
    tieBrokenBy,
  };
}
