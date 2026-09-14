import type { PredictionOutcome } from "../predictions/outcome";

// ความน่าจะเป็นของแต่ละผล (เปอร์เซ็นต์ จำนวนเต็ม รวมกัน 100) ที่ AI ประเมินไว้ตอนทาย
// ใช้วัด "calibration": โมเดลที่บอกว่ามั่นใจ 80% ควรถูกจริงราว 80% — ความแม่นอย่างเดียวบอกไม่ได้
// ว่าโมเดล "รู้ว่าตัวเองไม่รู้" หรือเปล่า
export type OutcomeProbabilities = Record<PredictionOutcome, number>;

export type RawProbabilities = {
  probHome?: number | null;
  probDraw?: number | null;
  probAway?: number | null;
};

/**
 * แปลงตัวเลขดิบจากโมเดลให้เป็นเปอร์เซ็นต์จำนวนเต็มรวม 100 — โมเดลมักส่งมารวมได้ 99 หรือ 101
 * หรือส่งเป็นสัดส่วน 0-1 แทน; คืน null ถ้าขาดหรือใช้ไม่ได้ (ติดลบ/ไม่ใช่ตัวเลข/รวมเป็นศูนย์)
 * เพื่อให้ผู้เรียกเก็บเป็น null แทนการแต่งตัวเลขขึ้นมาเอง
 */
export function normalizeProbabilities(
  raw: RawProbabilities | null | undefined,
): OutcomeProbabilities | null {
  if (!raw) return null;
  const values = [raw.probHome, raw.probDraw, raw.probAway];
  if (
    values.some(
      (v) => typeof v !== "number" || !Number.isFinite(v) || v < 0,
    )
  ) {
    return null;
  }
  const nums = values as number[];
  const sum = nums.reduce((a, b) => a + b, 0);
  // ผลรวมล้น (1e308 x3 = Infinity) จะทำให้ทุกค่าหารได้ 0 แล้วเศษ 100 ไปตกที่ตัวแรก — ถือว่าใช้ไม่ได้
  if (!Number.isFinite(sum) || sum <= 0) return null;

  const scaled = nums.map((v) => (v / sum) * 100);
  const rounded = scaled.map((v) => Math.round(v));
  // ปัดเศษแล้วอาจรวมได้ 99/101 — โยนส่วนต่างให้ค่าที่ใหญ่สุด จะได้ไม่เปลี่ยนลำดับความน่าจะเป็น
  const drift = 100 - rounded.reduce((a, b) => a + b, 0);
  const iMax = scaled.indexOf(Math.max(...scaled));
  rounded[iMax] += drift;

  return { HOME: rounded[0], DRAW: rounded[1], AWAY: rounded[2] };
}

/** ความมั่นใจในผลที่เลือก = ความน่าจะเป็นของผลนั้น (ใช้แสดงว่า "มั่นใจ 65%") */
export function confidenceOf(
  probabilities: OutcomeProbabilities | null,
  outcome: PredictionOutcome,
): number | null {
  return probabilities ? probabilities[outcome] : null;
}
