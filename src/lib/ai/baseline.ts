import type { PredictionOutcome } from '../predictions/outcome';
import type { FormEntry, MatchContext } from './context';

// baseline AI — deterministic เต็มรูปแบบ ไม่มี LLM เกี่ยวข้อง ดู 2 อย่าง:
//   1. ฟอร์ม 5 นัดหลังสุดของแต่ละทีม (เจอใครก็ได้)
//   2. 5 นัดหลังสุดที่ "สองทีมนี้เจอกันเอง" (head-to-head)
// ทั้งคู่มาจาก MatchContext ที่ context.ts สร้างให้ ซึ่งกรองด้วย kickoff_at ของแมตช์เป้าหมายเสมอ
// (ไม่มีทางเห็นผลแมตช์ในอนาคต) — เป็นข้อมูลชุดเดียวกับที่ AI ตัวที่ใช้ LLM จะได้เห็น ทำให้เทียบกัน
// ได้ตรง ๆ ว่า LLM ฉลาดกว่ากติกาง่าย ๆ นี้จริงไหม

// ใช้ "แต้มเฉลี่ยต่อนัด" (0-3) ไม่ใช่แต้มรวม เพราะจำนวนนัดที่มีข้อมูลของแต่ละฝั่งไม่เท่ากันได้
// (โดยเฉพาะ h2h ที่ต้นซีซันอาจมีแค่ 1-2 นัด หรือไม่มีเลย) ถ้าใช้แต้มรวมจะเอนเอียงไปทางฝั่งที่บังเอิญ
// มีข้อมูลเยอะกว่าโดยไม่มีเหตุผล
function avgPoints(entries: { result: 'W' | 'D' | 'L' }[]): number {
  if (entries.length === 0) return 0;
  const total = entries.reduce((s, m) => s + (m.result === 'W' ? 3 : m.result === 'D' ? 1 : 0), 0);
  return total / entries.length;
}

// h2h ใน MatchContext เก็บจากมุมมองของ "ทีมเหย้าของแมตช์เป้าหมาย" — ฝั่งเยือนจึงต้องกลับผลก่อน
function mirror(entries: FormEntry[]) {
  return entries.map((e) => ({
    result: e.result === 'W' ? ('L' as const) : e.result === 'L' ? ('W' as const) : ('D' as const),
  }));
}

// ค่าถ่วงน้ำหนัก + เกณฑ์เสมอ เป็นการตัดสินใจเชิงออกแบบ (ไม่ใช่ค่าที่ "ถูก" ทางคณิตศาสตร์) ปรับได้
// ฟอร์มปัจจุบันถ่วงหนักกว่า h2h เพราะสะท้อนสภาพทีม ณ ตอนนี้มากกว่าประวัติเจอกันเมื่อหลายปีก่อน
// ที่ผู้เล่น/โค้ชอาจเปลี่ยนไปหมดแล้ว
const FORM_WEIGHT = 2;
const H2H_WEIGHT = 1;
// ถ้าคะแนนสองฝั่งต่างกันน้อยกว่านี้ถือว่าสูสีเกินจะฟันธง -> ทายเสมอ (ถ้าไม่มีเกณฑ์นี้ baseline จะแทบ
// ไม่ทายเสมอเลย เพราะค่าทศนิยมสองฝั่งชนกันพอดีเป๊ะ ๆ ยาก ทั้งที่จริงเสมอเกิดราว 25% ของนัดทั้งหมด)
const DRAW_THRESHOLD = 0.25;

export function baselinePredict(
  ctx: Pick<MatchContext, 'homeForm' | 'awayForm' | 'headToHead'>,
): { outcome: PredictionOutcome; reasoning: string } {
  const homeFormAvg = avgPoints(ctx.homeForm);
  const awayFormAvg = avgPoints(ctx.awayForm);
  const homeH2hAvg = avgPoints(ctx.headToHead);
  const awayH2hAvg = avgPoints(mirror(ctx.headToHead));

  // หารด้วยผลรวมน้ำหนักเพื่อให้คะแนนสุดท้ายกลับมาอยู่สเกล 0-3 เท่ากับแต้มเฉลี่ยต่อนัด อ่านง่ายกว่า
  const totalWeight = FORM_WEIGHT + H2H_WEIGHT;
  const homeScore = (FORM_WEIGHT * homeFormAvg + H2H_WEIGHT * homeH2hAvg) / totalWeight;
  const awayScore = (FORM_WEIGHT * awayFormAvg + H2H_WEIGHT * awayH2hAvg) / totalWeight;
  const diff = homeScore - awayScore;

  const detail =
    `เหย้า ${homeScore.toFixed(2)} (ฟอร์ม ${homeFormAvg.toFixed(2)} จาก ${ctx.homeForm.length} นัด, ` +
    `h2h ${homeH2hAvg.toFixed(2)} จาก ${ctx.headToHead.length} นัด) vs ` +
    `เยือน ${awayScore.toFixed(2)} (ฟอร์ม ${awayFormAvg.toFixed(2)} จาก ${ctx.awayForm.length} นัด, ` +
    `h2h ${awayH2hAvg.toFixed(2)})`;

  if (Math.abs(diff) < DRAW_THRESHOLD) {
    return { outcome: 'DRAW', reasoning: `สูสีเกินเกณฑ์ ${DRAW_THRESHOLD} — ${detail}` };
  }
  return {
    outcome: diff > 0 ? 'HOME' : 'AWAY',
    reasoning: `${diff > 0 ? 'เหย้า' : 'เยือน'}เหนือกว่า ${Math.abs(diff).toFixed(2)} — ${detail}`,
  };
}
