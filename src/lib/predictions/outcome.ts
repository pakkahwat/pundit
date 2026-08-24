// ผลแพ้/ชนะ/เสมอ — เป็นสิ่งเดียวที่ผู้เล่นทาย (ไม่มีการทายสกอร์ในกติกานี้)
export type PredictionOutcome = 'HOME' | 'DRAW' | 'AWAY';

export const PREDICTION_OUTCOMES: PredictionOutcome[] = ['HOME', 'DRAW', 'AWAY'];

export function isPredictionOutcome(value: unknown): value is PredictionOutcome {
  return value === 'HOME' || value === 'DRAW' || value === 'AWAY';
}

export function outcomeLabel(
  outcome: PredictionOutcome,
  homeTeam: string,
  awayTeam: string,
): string {
  if (outcome === 'HOME') return `${homeTeam} ชนะ`;
  if (outcome === 'AWAY') return `${awayTeam} ชนะ`;
  return 'เสมอ';
}
